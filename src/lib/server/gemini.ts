// Gemini, with several keys and several models. Free quotas belong to a Google Cloud project, not to
// a key, so each key should come from its own project. On the free tier a model allows only a few
// requests a day, and the newest models are often overloaded, so every model is tried with every key,
// best model first:
// - a key that has used up a model's quota rests for that model until the quota resets, and the same
//   model is tried with the next key;
// - a key that doesn't work at all rests for an hour;
// - any other failure (overloaded, server error, timeout) moves on to the next model;
// - when a request has said nothing for `hedgeMs`, a backup request starts on another model, and
//   whichever answers first is used.

import { KeyPool, keyLabel, keysFrom, untilPacificMidnight } from "./keys";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite"];

/** A comma-separated model list from the environment, or the default. */
export function modelsFrom(envName: string, fallback: string[]): string[] {
  const fromEnv = process.env[envName]?.split(",").map((m) => m.trim()).filter(Boolean);
  return fromEnv?.length ? fromEnv : fallback;
}

export const geminiModels = () => modelsFrom("GEMINI_MODELS", DEFAULT_MODELS);

/** The fastest thinking setting each model accepts ("minimal" is rejected by some). */
export function thinkingFor(model: string) {
  return /^gemini-3(\.[156])?-flash/.test(model) ? { thinkingLevel: "minimal" } : { thinkingLevel: "low" };
}

let pool: KeyPool | null = null;
/** GEMINI_API_KEY, GEMINI_API_KEY1, GEMINI_API_KEY2, ... (or GEMINI_API_KEY_1, ...). */
export const geminiKeys = () => (pool ??= new KeyPool(keysFrom("GEMINI_API_KEY"), "Gemini"));

type Failure = "quota" | "key" | "model";

export class GeminiError extends Error {
  constructor(message: string, readonly status: number, readonly failure: Failure = "model") {
    super(message);
  }
}

/** What a failed request says: the key ran out for this model, the key is bad, or the model failed. */
function failed(key: string, model: string, status: number, detail: string): GeminiError {
  const message = detail.match(/"message":\s*"([^"]{0,160})/)?.[1] ?? detail.slice(0, 160);
  const keys = geminiKeys();
  if (status === 429) {
    // Per-minute limits say how long to wait; a used-up daily quota comes back at midnight in California.
    const wait = Number(detail.match(/"retryDelay":\s*"(\d+)s"/)?.[1] ?? 60) * 1000;
    const daily = /PerDay/i.test(detail);
    keys.rest(key, daily ? untilPacificMidnight() : Math.min(wait, 3_600_000), model, daily ? "daily quota used up" : "rate limited");
    return new GeminiError(`HTTP 429 ${message}`, status, "quota");
  }
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|API key expired/i.test(detail)) {
    keys.rest(key, 3_600_000, "*", `HTTP ${status} ${message}`);
    return new GeminiError(`HTTP ${status} ${message}`, status, "key");
  }
  return new GeminiError(`HTTP ${status} ${message}`, status, "model");
}

/**
 * Runs one request at a time over every model × key until one works (see the top of this file), plus a
 * backup on another model when the running one is slow. `run` calls `claim()` once it has something to
 * give: the first to claim is used and the others are stopped; claim() is false for the others.
 */
function race<T>(
  models: string[],
  run: (model: string, key: string, signal: AbortSignal, claim: () => boolean) => Promise<T>,
  { hedgeMs, timeoutMs, signal }: { hedgeMs: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<{ model: string; value: T }> {
  const keys = geminiKeys();
  // Best model first; for each model, its resting keys last.
  const attempts = models.flatMap((model) => keys.order(model).map((key) => ({ model, key })));
  return new Promise((resolve, reject) => {
    const controllers: AbortController[] = [];
    const errors: string[] = [];
    const used = new Set<number>();
    const failedModels = new Set<string>();
    const inFlight = new Set<string>(); // models with a request running: a backup goes to a different model
    let winner: AbortController | null = null; // the request whose answer is used
    let settled = false;

    const finish = (err: Error | null, result?: { model: string; value: T }) => {
      if (settled) return;
      settled = true;
      clearTimeout(overall);
      signal?.removeEventListener("abort", onAbort);
      for (const c of controllers) c.abort();
      if (err) reject(err);
      else resolve(result!);
    };
    const onAbort = () => finish(new Error("aborted"));
    signal?.addEventListener("abort", onAbort);
    const overall = timeoutMs ? setTimeout(() => finish(new GeminiError(`timeout; ${errors.join("; ")}`, 504)), timeoutMs) : undefined;

    const launch = () => {
      if (settled || winner) return;
      const open = attempts.flatMap((a, j) => (!used.has(j) && !failedModels.has(a.model) && !inFlight.has(a.model) ? [j] : []));
      // A key resting for its model (perhaps since a moment ago, from another request) only when nothing else is left.
      const i = open.find((j) => keys.ready(attempts[j].key, attempts[j].model)) ?? open[0];
      if (i === undefined) {
        if (inFlight.size === 0) finish(new GeminiError(errors.join("; ") || "no Gemini API key set", 503));
        return;
      }
      used.add(i);
      const { model, key } = attempts[i];
      const ctrl = new AbortController();
      controllers.push(ctrl);
      inFlight.add(model);
      const hedge = setTimeout(launch, hedgeMs);
      const claim = () => {
        clearTimeout(hedge);
        if (!winner) {
          winner = ctrl;
          for (const c of controllers) if (c !== ctrl) c.abort(); // the others lost the race
        }
        return winner === ctrl;
      };

      run(model, key, ctrl.signal, claim)
        .then((value) => {
          inFlight.delete(model);
          if (claim()) finish(null, { model, value });
        })
        .catch((e: Error) => {
          clearTimeout(hedge);
          inFlight.delete(model);
          if (settled || (winner && winner !== ctrl)) return; // stopped after losing the race
          if (winner === ctrl) return finish(e); // failed half way; nothing to fall back to cleanly
          errors.push(`${model} ${keyLabel(keys, key)}: ${e.message}`);
          // Out of quota or a bad key: the same model with the next key. Anything else: the next model.
          if (!(e instanceof GeminiError && (e.failure === "quota" || e.failure === "key"))) failedModels.add(model);
          launch(); // the next attempt, or finishes with the errors when none are left
        });
    };
    if (signal?.aborted) onAbort();
    else launch();
  });
}

const headers = (key: string) => ({ "x-goog-api-key": key, "Content-Type": "application/json" });

/**
 * One request that is not streamed (speech to text, text to speech). `accept` decides whether a
 * successful response has what was asked for (e.g. audio); `timeoutMs` is for each request.
 */
export async function generate(
  models: string[],
  bodyFor: (model: string) => object,
  { signal, timeoutMs = 20000, hedgeMs = 8000, accept = () => true }: {
    signal?: AbortSignal; timeoutMs?: number; hedgeMs?: number; accept?: (json: GeminiResponse) => boolean;
  } = {},
): Promise<{ model: string; json: GeminiResponse }> {
  const { model, value } = await race(models, async (model, key, attempt) => {
    const res = await fetch(`${BASE}/${model}:generateContent`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify(bodyFor(model)),
      signal: AbortSignal.any([attempt, AbortSignal.timeout(timeoutMs)]),
    });
    const detail = await res.text();
    if (!res.ok) throw failed(key, model, res.status, detail);
    const json = JSON.parse(detail) as GeminiResponse;
    if (!accept(json)) throw new GeminiError(json.candidates?.[0]?.finishReason ?? "nothing usable", 502);
    return json;
  }, { hedgeMs, signal });
  return { model, json: value };
}

export interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean; inlineData?: { mimeType: string; data: string } }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export interface GeminiBody {
  systemInstruction: { parts: { text: string }[] };
  contents: { role: "user" | "model"; parts: { text: string }[] }[];
  generationConfig: Record<string, unknown>;
}

/** One streaming request. Calls onText with the full text so far; resolves with the final text. */
async function streamOnce(model: string, key: string, body: GeminiBody, signal: AbortSignal, onText: (full: string) => void) {
  const res = await fetch(`${BASE}/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ ...body, generationConfig: { ...body.generationConfig, thinkingConfig: thinkingFor(model) } }),
    signal,
  });
  if (!res.ok || !res.body) throw failed(key, model, res.status, await res.text().catch(() => ""));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const data = event.split("\n").find((l) => l.startsWith("data: "));
      if (!data) continue;
      const chunk = JSON.parse(data.slice(6)) as GeminiResponse;
      if (chunk.promptFeedback?.blockReason) throw new GeminiError(`blocked: ${chunk.promptFeedback.blockReason}`, 400);
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      const piece = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      if (piece) {
        text += piece;
        onText(text);
      }
    }
  }
  if (!text) throw new GeminiError("empty response", 502);
  return text;
}

export interface StreamResult {
  model: string;
  text: string;
}

/** A streamed answer: the first request to say something is the one listened to (`timeoutMs` in all). */
export async function streamWithFallback(
  body: GeminiBody,
  onText: (full: string) => void,
  { models = geminiModels(), hedgeMs = 8000, timeoutMs = 30000, signal }: {
    models?: string[]; hedgeMs?: number; timeoutMs?: number; signal?: AbortSignal;
  } = {},
): Promise<StreamResult> {
  const { model, value } = await race(models, (model, key, attempt, claim) =>
    streamOnce(model, key, body, attempt, (full) => {
      if (claim()) onText(full);
    }), { hedgeMs, timeoutMs, signal });
  return { model, text: value };
}
