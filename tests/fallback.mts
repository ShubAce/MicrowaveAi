// Keys, rotation and the voice fallback (Sarvam → Gemini), against fake Sarvam and Gemini services:
// no real request is made and no quota is spent. Run: npx tsx tests/fallback.mts

for (const k of Object.keys(process.env)) if (/GEMINI|SARVAM/.test(k)) delete process.env[k];
Object.assign(process.env, { GEMINI_API_KEY1: "k1", GEMINI_API_KEY_2: "k2", GEMINI_API_KEY3: "k3", SARVAMAI_1: "s1", SARVAMAI_2: "s2" });

// --- the fake services. A plan says what one model+key (Gemini) or key (Sarvam) answers.
type Plan = { status?: number; quota?: "day" | "minute"; code?: string; wait?: number; chunks?: string[]; failAfter?: number; json?: object };
let plans: Record<string, Plan> = {};
let calls: string[] = [];
const bodies: Record<string, unknown>[] = [];

const sleep = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason ?? new DOMException("This operation was aborted", "AbortError"))));
  });

globalThis.fetch = (async (url: string, init: RequestInit) => {
  const sarvam = String(url).startsWith("https://api.sarvam.ai/");
  const headers = init.headers as Record<string, string>;
  const id = sarvam
    ? `${String(url).split("/").pop()}/${headers["api-subscription-key"]}`
    : `${String(url).match(/models\/([^:]+):/)![1]}/${headers["x-goog-api-key"]}`;
  calls.push(id);
  if (typeof init.body === "string") bodies.push(JSON.parse(init.body));
  const plan = plans[id] ?? { status: 503 };
  await sleep(plan.wait ?? 0, init.signal);
  if (plan.status) {
    const error = plan.status === 429 && !sarvam
      ? { code: 429, message: "You exceeded your current quota", details: [{ violations: [{ quotaId: plan.quota === "day" ? "GenerateRequestsPerDayPerProjectPerModel-FreeTier" : "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] }, { retryDelay: "20s" }] }
      : { code: plan.code ?? plan.status, message: "The model is overloaded." };
    return new Response(JSON.stringify({ error }), { status: plan.status });
  }
  if (plan.json) return Response.json(plan.json);
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(c) {
      try {
        for (const [i, t] of (plan.chunks ?? []).entries()) {
          if (plan.failAfter === i) throw new Error("connection reset");
          c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`));
          await sleep(40, init.signal);
        }
        c.close();
      } catch (e) {
        c.error(e);
      }
    },
  }));
}) as typeof fetch;

const warnings: string[] = [];
console.warn = (...a: unknown[]) => void warnings.push(a.join(" "));

const { KeyPool, keysFrom, untilPacificMidnight } = await import("../src/lib/server/keys");
const { generate, streamWithFallback } = await import("../src/lib/server/gemini");
const { speak } = await import("../src/lib/server/sarvam");
const { hear, say } = await import("../src/lib/server/voice");

let bad = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? `\n    ${detail}` : ""}`);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const reset = (p: Record<string, Plan>) => ((plans = p), (calls = []), (bodies.length = 0), (warnings.length = 0));

// --- keys
check("keys in number order (NAME1, NAME_2, ...)", same(keysFrom("GEMINI_API_KEY"), ["k1", "k2", "k3"]));
{
  const [a, b, c] = ["SECRET-A", "SECRET-B", "SECRET-C"];
  const pool = new KeyPool([a, b, c]);
  pool.rest(a, 60_000, "m1");
  check("a key resting for one model goes last there only", same(pool.order("m1"), [b, c, a]) && same(pool.order("m2"), [a, b, c]));
  pool.rest(b, 30_000);
  check("a key resting everywhere goes last everywhere, soonest back first", same(pool.order("m1"), [c, b, a]) && same(pool.order("m2", { resting: false }), [a, c]));
  check("the log names a key by its number, never the key", warnings.some((w) => w.includes("API key 1/3 set aside for 1 min for m1")) && !warnings.some((w) => w.includes("SECRET")), warnings.join(" | "));
}
check("daily quotas come back at midnight in California", untilPacificMidnight(new Date("2026-10-25T06:30:00Z")) === 30 * 60_000);

// --- streamed answers
const body = { systemInstruction: { parts: [{ text: "" }] }, contents: [], generationConfig: {} };
async function stream(name: string, models: string[], p: Record<string, Plan>, want: { model?: string; text?: string; error?: RegExp; calls?: string[]; never?: string[] }) {
  reset(p);
  const seen: string[] = [];
  let got = "";
  let ok: boolean;
  try {
    const r = await streamWithFallback(body, (full) => seen.push(full), { models, hedgeMs: 150, timeoutMs: 5000 });
    got = `${r.model}: ${r.text}`;
    // onText only ever hears one answer, growing
    ok = !want.error && r.model === want.model && r.text === want.text && seen.every((s, i) => !i || s.startsWith(seen[i - 1]));
  } catch (e) {
    got = `error: ${(e as Error).message}`;
    ok = !!want.error?.test(got);
  }
  if (want.calls && !same(calls, want.calls)) ok = false;
  if (want.never?.some((n) => calls.includes(n))) ok = false;
  check(`stream: ${name}`, ok, `got ${got}; calls ${calls.join(" ")}`);
}

// Key 1 is used up for A, A is slow on key 2, and the backup B is used up on key 1 too. A must not
// start again on key 3 next to the slow one (two requests of one model once failed the whole answer).
await stream("slow model + used-up keys", ["A", "B"], {
  "A/k1": { status: 429, quota: "day" },
  "A/k2": { wait: 400, chunks: ['{"a":', "1}"] },
  "B/k1": { status: 429, quota: "day" },
  "B/k2": { wait: 2000, chunks: ['{"b":1}'] },
  "A/k3": { chunks: ['{"a3":1}'] },
}, { model: "A", text: '{"a":1}', calls: ["A/k1", "A/k2", "B/k1", "B/k2"] });
await stream("a used-up key goes last", ["A"], { "A/k2": { chunks: ["ok"] } }, { model: "A", text: "ok", calls: ["A/k2"] });
await stream("the backup wins when the first stays silent", ["C", "D"], { "C/k1": { wait: 3000, chunks: ["late"] }, "D/k1": { chunks: ["fast"] } }, { model: "D", text: "fast", calls: ["C/k1", "D/k1"] });
await stream("an overloaded model is not tried with its other keys", ["E", "F"], { "E/k1": { status: 503 }, "F/k1": { chunks: ["f"] } }, { model: "F", text: "f", calls: ["E/k1", "F/k1"] });
await stream("rate limited: the next key", ["G"], { "G/k1": { status: 429, quota: "minute" }, "G/k2": { chunks: ["g"] } }, { model: "G", text: "g", calls: ["G/k1", "G/k2"] });
await stream("breaking off half way is an error", ["J", "K"], { "J/k1": { chunks: ['{"x":', "1}"], failAfter: 1 }, "K/k1": { chunks: ["k"] } }, { error: /connection reset/ });
await stream("nothing works: every failure listed", ["L"], { "L/k1": { status: 429, quota: "day" }, "L/k2": { status: 429, quota: "day" }, "L/k3": { status: 503 } }, { error: /L key 1\/3.*L key 2\/3.*L key 3\/3/ });
await stream("two backups in a row", ["M", "N", "O"], { "M/k1": { wait: 3000, chunks: ["m"] }, "N/k1": { status: 503 }, "O/k1": { wait: 50, chunks: ["o"] } }, { model: "O", text: "o", never: ["M/k2", "M/k3"] });

// --- one-off requests
const answer = (text: string) => ({ json: { candidates: [{ content: { parts: [{ text }] } }] } });
async function once(name: string, models: string[], p: Record<string, Plan>, want: { model?: string; error?: RegExp; calls?: string[] }, { hedgeMs = 150, timeoutMs = 1000 } = {}) {
  reset(p);
  let got = "";
  let ok: boolean;
  try {
    const r = await generate(models, () => ({}), { hedgeMs, timeoutMs, accept: (j) => !!j.candidates?.[0]?.content?.parts?.[0]?.text });
    got = r.model;
    ok = !want.error && r.model === want.model;
  } catch (e) {
    got = `error: ${(e as Error).message}`;
    ok = !!want.error?.test(got);
  }
  if (want.calls && !same(calls, want.calls)) ok = false;
  check(`one-off: ${name}`, ok, `got ${got}; calls ${calls.join(" ")}`);
}
await once("used up: the next key", ["P"], { "P/k1": { status: 429, quota: "day" }, "P/k2": answer("p") }, { model: "P", calls: ["P/k1", "P/k2"] });
await once("nothing usable in the answer: the next model", ["Q", "R"], { "Q/k1": { json: { candidates: [{ finishReason: "SAFETY" }] } }, "R/k1": answer("r") }, { model: "R", calls: ["Q/k1", "R/k1"] });
await once("too slow: a backup on the next model", ["S", "T"], { "S/k1": { ...answer("s"), wait: 800 }, "T/k1": answer("t") }, { model: "T", calls: ["S/k1", "T/k1"] });
await once("hung: given up after its time, then the next model", ["U", "V"], { "U/k1": { ...answer("u"), wait: 5000 }, "V/k1": answer("v") }, { model: "V", calls: ["U/k1", "V/k1"] }, { hedgeMs: 5000, timeoutMs: 300 });
{
  // A request that started before a key was set aside does not walk into it afterwards.
  reset({ "W/k1": { status: 503, wait: 100 }, "X/k1": { status: 429, quota: "minute" }, "X/k2": answer("x") });
  const [w, x] = await Promise.all([
    generate(["W", "X"], () => ({}), { hedgeMs: 5000 }),
    generate(["X"], () => ({}), { hedgeMs: 5000 }),
  ]);
  check("one-off: a key set aside meanwhile is skipped", w.model === "X" && x.model === "X" && calls.filter((c) => c === "X/k1").length === 1, calls.join(" "));
}
{
  reset({});
  const ctrl = new AbortController();
  ctrl.abort();
  const r = await generate(["Y"], () => ({}), { signal: ctrl.signal }).then(() => "answered", (e: Error) => e.message);
  check("one-off: nothing sent once the phone has gone", r === "aborted" && calls.length === 0, `${r}; calls ${calls.join(" ")}`);
}

// --- Sarvam keys
const MP3 = Buffer.from("ID3 fake mp3").toString("base64");
{
  reset({ "text-to-speech/s1": { status: 400, code: "invalid_request_error" }, "text-to-speech/s2": { json: { audios: [MP3] } } });
  const r = await speak("नमस्ते", "x", 1).then(() => "spoken", (e: Error) => e.message);
  check("sarvam: a bad request is not tried with the other key", /HTTP 400/.test(r) && same(calls, ["text-to-speech/s1"]), `${r}; calls ${calls.join(" ")}`);
}
{
  reset({ "text-to-speech/s1": { status: 429, code: "insufficient_quota_error" }, "text-to-speech/s2": { json: { audios: [MP3] } } });
  const r = await speak("नमस्ते", "x", 1);
  check("sarvam: out of credits, the next key", r === MP3 && same(calls, ["text-to-speech/s1", "text-to-speech/s2"]) && warnings.some((w) => w.includes("Sarvam key 1/2 set aside for 6 h: out of credits")), warnings.join(" | "));
  reset({ "text-to-speech/s2": { json: { audios: [MP3] } } });
  await speak("नमस्ते", "x", 1);
  check("sarvam: the key out of credits is skipped afterwards", same(calls, ["text-to-speech/s2"]), calls.join(" "));
}

// --- the voice fallback
const PCM = Buffer.alloc(4800, 1); // 0.1 s of 24 kHz 16-bit mono
const audioAnswer = (mimeType: string, data: Buffer) => ({ json: { candidates: [{ content: { parts: [{ inlineData: { mimeType, data: data.toString("base64") } }] } }] } });
{
  reset({ "text-to-speech/s2": { json: { audios: [MP3] } } });
  const r = await say("फिर, स्टॉप बटन दबाइए।", "x", 1);
  check("voice: Sarvam first", r.by === "sarvam" && r.mime === "audio/mpeg" && r.b64 === MP3);
}
{
  // Sarvam key 2 runs out too: Gemini speaks, only the words go to it, and its raw PCM becomes a WAV.
  reset({ "text-to-speech/s2": { status: 429, code: "insufficient_quota_error" }, "gemini-3.8-flash-lite-tts/k1": audioAnswer("audio/L16;codec=pcm;rate=24000", PCM) });
  const r = await say("फिर, स्टॉप बटन दबाइए।", "x", 0.8);
  const wav = Buffer.from(r.b64, "base64");
  const sent = bodies.find((b) => "generationConfig" in b) as { contents: { parts: { text: string }[] }[]; generationConfig: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } } } } | undefined;
  check("voice: Gemini takes over when Sarvam is out", r.by === "gemini-3.8-flash-lite-tts" && r.mime === "audio/wav", `${r.by} ${r.mime}`);
  check("voice: Gemini gets the words only (no instruction it could read out)", sent?.contents[0].parts[0].text === "फिर, स्टॉप बटन दबाइए।" && sent.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName === "Sulafat", JSON.stringify(sent?.contents));
  check("voice: raw PCM gets a WAV header", wav.subarray(0, 4).toString() === "RIFF" && wav.subarray(8, 12).toString() === "WAVE" && wav.readUInt32LE(24) === 24000 && wav.readUInt16LE(22) === 1 && wav.readUInt32LE(40) === PCM.length && wav.length === 44 + PCM.length);
}
{
  // Both Sarvam keys rest now: no Sarvam request at all, and a WAV from Gemini passes through as it is.
  const WAV = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(60, 2)]);
  reset({ "gemini-3.8-flash-lite-tts/k1": audioAnswer("audio/wav", WAV) });
  const r = await say("हाँ।", "x", 1);
  check("voice: resting Sarvam keys are not asked", !calls.some((c) => c.startsWith("text-to-speech/")) && Buffer.from(r.b64, "base64").equals(WAV), calls.join(" "));
  const told = warnings.filter((w) => w.startsWith("text-to-speech: Sarvam failed")).length;
  await say("ठीक है।", "x", 1);
  check("voice: the switch to Gemini is logged once, not for every piece", told <= 1 && warnings.filter((w) => w.startsWith("text-to-speech: Sarvam failed")).length === told, warnings.join(" | "));
}
{
  // Speech to text: Sarvam's keys rest too (they share the pool), so Gemini writes it down, given a plain audio type.
  reset({ "gemini-3.1-flash-lite/k1": answer(" “पनीर टिक्का कैसे बनाते हैं?” ") });
  const r = await hear(new Blob([Buffer.alloc(2000)], { type: "audio/webm;codecs=opus" }), "question.webm");
  const sent = bodies[0] as { contents: { parts: { inlineData?: { mimeType: string } }[] }[] } | undefined;
  check("hear: Gemini writes it down when Sarvam can't", r.by === "gemini-3.1-flash-lite" && r.text === "पनीर टिक्का कैसे बनाते हैं?", `${r.by}: ${r.text}`);
  check("hear: the recording's type is made plain for Gemini", sent?.contents[0].parts[0].inlineData?.mimeType === "audio/webm", JSON.stringify(sent?.contents[0].parts[0].inlineData?.mimeType));
}

console.log(bad ? `${bad} FAILED` : "all pass");
process.exitCode = bad ? 1 : 0;
