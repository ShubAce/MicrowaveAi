// API keys, several per service, tried one after another. A key that has run out (a free tier's daily
// quota, Sarvam credits) or is being rate limited is set aside for a while, so later requests go
// straight to a key that works. All of this lives as long as the server instance does.

/**
 * The keys for a service, in order: NAME, NAME1, NAME_1, NAME2, NAME_2, ... and NAMES (comma
 * separated), for each of the given names. Blank values and repeats are dropped.
 */
export function keysFrom(...names: string[]): string[] {
  const found: { key: string; name: string; n: number; at: number }[] = [];
  names.forEach((name, at) => {
    for (const [env, value] of Object.entries(process.env)) {
      const m = env.match(new RegExp(`^${name}(?:_?(\\d+)|(S))?$`));
      if (!m || !value) continue;
      const values = m[2] ? value.split(",") : [value];
      values.forEach((v, i) => found.push({ key: v.trim(), name: env, n: m[1] ? Number(m[1]) : m[2] ? i : 0, at }));
    }
  });
  found.sort((a, b) => a.at - b.at || a.n - b.n || a.name.localeCompare(b.name));
  return [...new Set(found.map((f) => f.key).filter(Boolean))];
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
  const min = Math.round(ms / 60_000);
  if (min < 1) return `${Math.round(ms / 1000)} s`;
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

export class KeyPool {
  /** `${key}\u0000${scope}` → time until which that key is not used for that scope ("*" = every scope). */
  private resting = new Map<string, number>();

  /** `service` names the keys in the server log ("Gemini key 2/4"). */
  constructor(readonly keys: string[], readonly service = "API") {}

  get size() {
    return this.keys.length;
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
   *  with `why`, when the key starts resting (not again for each request that finds it resting). */
  rest(key: string, ms: number, scope = "*", why = "") {
    if (this.ready(key, scope)) {
      console.warn(`${this.service} ${keyLabel(this, key)} set aside for ${forHowLong(ms)}${scope === "*" ? "" : ` for ${scope}`}${why ? `: ${why}` : ""}`);
    }
    const id = `${key}\u0000${scope}`;
    this.resting.set(id, Math.max(this.resting.get(id) ?? 0, Date.now() + ms));
  }
}

/** Which of a pool's keys a message is about, without giving the key away (for the server log). */
export const keyLabel = (pool: KeyPool, key: string) => `key ${pool.keys.indexOf(key) + 1}/${pool.size}`;
