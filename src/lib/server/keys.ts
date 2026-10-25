// API keys, several per service, tried one after another. A key that has run out (a free tier's daily
// quota, Sarvam credits) or is being rate limited is set aside for a while, so later requests go
// straight to a key that works. All of this lives as long as the server instance does.

export interface FoundKey {
  key: string;
  /** The environment variable it came from: what the server log calls it (never the key itself). */
  name: string;
}

/**
 * The keys for a service, in order: NAME, NAME1 or NAME_1, NAME2 or NAME_2, ..., for each of the given
 * names. Blank values are dropped; a key set under two names counts once, under its numbered name.
 */
export function keysFrom(...names: string[]): FoundKey[] {
  const found: (FoundKey & { n: number; at: number })[] = [];
  names.forEach((name, at) => {
    for (const [env, value] of Object.entries(process.env)) {
      const m = env.match(new RegExp(`^${name}(?:_?(\\d+))?$`));
      const key = value?.trim();
      if (m && key) found.push({ key, name: env, n: m[1] ? Number(m[1]) : 0, at });
    }
  });
  const order = (a: (typeof found)[number], b: (typeof found)[number]) => a.at - b.at || a.n - b.n || a.name.localeCompare(b.name);
  const keep = new Map<string, (typeof found)[number]>();
  for (const f of found.sort(order)) if (!keep.has(f.key) || keep.get(f.key)!.n === 0) keep.set(f.key, f);
  return [...keep.values()].sort(order).map(({ key, name }) => ({ key, name }));
}

/** Milliseconds until the next midnight in California, when Google's free daily quotas reset. */
export function untilPacificMidnight(now = new Date()): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  );
  const elapsed = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000;
  return Math.max(60_000, 86_400_000 - elapsed);
}

/** "30 s", "5 min", "1 h 25 min": how long a key rests, for the server log. */
function forHowLong(ms: number) {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

export class KeyPool {
  /** `${key}\u0000${scope}` → time until which that key is not used for that scope ("*" = every scope). */
  private resting = new Map<string, number>();
  readonly keys: string[];
  private names: string[];

  /** `service` and the keys' variable names label them in the server log ("Gemini GEMINI_API_KEY2");
   *  keys given without a name are called "key 2/4". */
  constructor(keys: (string | FoundKey)[], readonly service = "API") {
    this.keys = keys.map((k) => (typeof k === "string" ? k : k.key));
    this.names = keys.map((k, i) => (typeof k === "string" ? `key ${i + 1}/${keys.length}` : k.name));
  }

  get size() {
    return this.keys.length;
  }

  /** Which key a message is about, without giving the key away. */
  label(key: string) {
    return this.names[this.keys.indexOf(key)] ?? "an unknown key";
  }

  /** `text` with every key of this pool replaced by its label: error messages can quote a key. */
  hide(text: string) {
    return this.keys.reduce((t, key, i) => t.split(key).join(this.names[i]), text);
  }

  private until(key: string, scope: string) {
    return Math.max(this.resting.get(`${key}\u0000${scope}`) ?? 0, this.resting.get(`${key}\u0000*`) ?? 0);
  }

  /** Keys to try for a scope (e.g. a model), in order. With `resting`, the keys that are resting come
   *  last (soonest back first), for a service with nothing to fall back on: its limit may have lifted. */
  order(scope = "*", { resting = true } = {}): string[] {
    const now = Date.now();
    const ready = this.keys.filter((k) => this.until(k, scope) <= now);
    if (!resting) return ready;
    const later = this.keys.filter((k) => this.until(k, scope) > now).sort((a, b) => this.until(a, scope) - this.until(b, scope));
    return [...ready, ...later];
  }

  /** Whether the key can be used for the scope right now. */
  ready(key: string, scope = "*") {
    return this.until(key, scope) <= Date.now();
  }

  /** Set a key aside for `ms` for one scope, or for everything with scope "*". The server log says so,
   *  with `why`, when the key starts resting or its rest gets much longer (a per-minute limit, then the
   *  day's quota), not for every request that finds it resting. */
  rest(key: string, ms: number, scope = "*", why = "") {
    const end = Date.now() + ms;
    if (this.ready(key, scope) || end > this.until(key, scope) + 60_000) {
      console.warn(`${this.service} ${this.label(key)} set aside for ${forHowLong(ms)}${scope === "*" ? "" : ` for ${scope}`}${why ? `: ${this.hide(why)}` : ""}`);
    }
    const id = `${key}\u0000${scope}`;
    this.resting.set(id, Math.max(this.resting.get(id) ?? 0, end));
  }
}
