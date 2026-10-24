// Streams an answer from Gemini, falling back across models. On the free tier each model allows only
// ~20 requests a day and the newest ones are often overloaded, so: an error (including "quota used
// up") moves straight to the next model, a model out of quota is skipped until its reset time, and a
// backup request starts only if the current model has said nothing for `hedgeMs`.

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite"];

export function geminiModels(): string[] {
  const fromEnv = process.env.GEMINI_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  return fromEnv?.length ? fromEnv : DEFAULT_MODELS;
}

/** The fastest thinking setting each model accepts ("minimal" is rejected by some). */
export function thinkingFor(model: string) {
  return /^gemini-3(\.[156])?-flash/.test(model) ? { thinkingLevel: "minimal" } : { thinkingLevel: "low" };
}

/** model → time (ms) until which it is out of quota. Lives as long as the server instance. */
const exhaustedUntil = new Map<string, number>();

function noteQuota(model: string, status: number, detail: string) {
  if (status !== 429) return;
  const delay = Number(detail.match(/"retryDelay":\s*"(\d+)s"/)?.[1] ?? 60);
  exhaustedUntil.set(model, Date.now() + Math.min(delay, 86400) * 1000);
}

const available = (model: string) => (exhaustedUntil.get(model) ?? 0) < Date.now();

export interface GeminiBody {
  systemInstruction: { parts: { text: string }[] };
  contents: { role: "user" | "model"; parts: { text: string }[] }[];
  generationConfig: Record<string, unknown>;
}

class GeminiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** One streaming request. Calls onText with the full text so far; resolves with the final text. */
async function streamOnce(model: string, body: GeminiBody, signal: AbortSignal, onText: (full: string) => void) {
  const res = await fetch(`${BASE}/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, generationConfig: { ...body.generationConfig, thinkingConfig: thinkingFor(model) } }),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    noteQuota(model, res.status, detail);
    const message = detail.match(/"message":\s*"([^"]{0,160})/)?.[1] ?? detail.slice(0, 160);
    throw new GeminiError(`HTTP ${res.status} ${message}`, res.status);
  }
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
      const chunk = JSON.parse(data.slice(6));
      if (chunk.promptFeedback?.blockReason) throw new GeminiError(`blocked: ${chunk.promptFeedback.blockReason}`, 400);
      const parts: { text?: string; thought?: boolean }[] = chunk.candidates?.[0]?.content?.parts ?? [];
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

export function streamWithFallback(
  body: GeminiBody,
  onText: (full: string) => void,
  { models: allModels = geminiModels(), hedgeMs = 8000, timeoutMs = 30000, signal }: {
    models?: string[]; hedgeMs?: number; timeoutMs?: number; signal?: AbortSignal;
  } = {},
): Promise<StreamResult> {
  // If every model is out of quota, still try them in order: the quota may have reset.
  const models = allModels.filter(available).length ? allModels.filter(available) : allModels;
  return new Promise((resolve, reject) => {
    const controllers: AbortController[] = [];
    const errors: string[] = [];
    let next = 0;
    let running = 0;
    let winner: string | null = null;
    let settled = false;

    const finish = (err: Error | null, result?: StreamResult) => {
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
    const overall = setTimeout(() => finish(new Error(`timeout; ${errors.join("; ")}`)), timeoutMs);

    const launch = () => {
      if (settled || winner) return;
      if (next >= models.length) {
        if (running === 0) finish(new Error(errors.join("; ") || "no models"));
        return;
      }
      const model = models[next++];
      const ctrl = new AbortController();
      controllers.push(ctrl);
      running++;
      let spoke = false;
      const hedge = setTimeout(() => !spoke && launch(), hedgeMs);

      streamOnce(model, body, ctrl.signal, (full) => {
        if (!spoke) {
          spoke = true;
          clearTimeout(hedge);
          if (!winner) {
            winner = model;
            for (const c of controllers) if (c !== ctrl) c.abort(); // the others lost the race
          }
        }
        if (winner === model) onText(full);
      })
        .then((text) => {
          running--;
          if (winner === model) finish(null, { model, text });
        })
        .catch((e: Error) => {
          clearTimeout(hedge);
          running--;
          if (settled || (winner && winner !== model)) return; // aborted after losing the race
          if (winner === model) return finish(e); // failed mid-answer; nothing to fall back to cleanly
          errors.push(`${model}: ${e.message}`);
          launch(); // next model, or finishes with the errors when none are left
        });
    };
    launch();
  });
}
