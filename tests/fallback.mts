// Keys, rotation and the voice fallback (Sarvam → Gemini), against fake Sarvam and Gemini services:
// no real request is made and no quota is spent. Run: npx tsx tests/fallback.mts

for (const k of Object.keys(process.env)) if (/GEMINI|SARVAM/.test(k)) delete process.env[k];
// The older single names too: GEMINI_API_KEY repeats GEMINI_API_KEY1; SARVAM_API_KEY is the second Sarvam key.
Object.assign(process.env, { GEMINI_API_KEY: "k1", GEMINI_API_KEY1: "k1", GEMINI_API_KEY_2: "k2", GEMINI_API_KEY3: "k3", SARVAMAI_1: "s1", SARVAM_API_KEY: "s2" });

// --- the fake services. A plan says what one model+key (Gemini) or API+key (Sarvam) answers.
type Plan = {
  status?: number; quota?: "day" | "minute"; code?: string; message?: string; wait?: number;
  chunks?: string[]; failAfter?: number; crlf?: boolean; json?: object; throws?: "timeout" | "network";
};
let plans: Record<string, Plan> = {};
let calls: string[] = [];
const bodies: Record<string, unknown>[] = [];
const signals: { id: string; signal?: AbortSignal | null }[] = [];

const sleep = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason ?? new DOMException("This operation was aborted", "AbortError"))));
  });
const event = (text: string) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}`;

globalThis.fetch = (async (url: string, init: RequestInit) => {
  const sarvam = String(url).startsWith("https://api.sarvam.ai/");
  const headers = init.headers as Record<string, string>;
  const id = sarvam
    ? `${String(url).split("/").pop()}/${headers["api-subscription-key"]}`
    : `${String(url).match(/models\/([^:]+):/)![1]}/${headers["x-goog-api-key"]}`;
  calls.push(id);
  signals.push({ id, signal: init.signal });
  if (typeof init.body === "string") bodies.push(JSON.parse(init.body));
  const plan = plans[id] ?? { status: 503 };
  await sleep(plan.wait ?? 0, init.signal);
  if (plan.throws) throw plan.throws === "timeout" ? new DOMException("The operation was aborted due to timeout", "TimeoutError") : new TypeError("fetch failed");
  if (plan.status) {
    const error = plan.status === 429 && !sarvam
      ? { code: 429, message: "You exceeded your current quota", details: [{ violations: [{ quotaId: plan.quota === "day" ? "GenerateRequestsPerDayPerProjectPerModel-FreeTier" : "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] }, { retryDelay: "20s" }] }
      : { code: plan.code ?? plan.status, message: plan.message ?? "The model is overloaded." };
    return new Response(JSON.stringify({ error }), { status: plan.status });
  }
  if (plan.json) return Response.json(plan.json);
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(c) {
      try {
        if (plan.crlf) {
          // CRLF framing, each read ending inside a separator ("…\r\n\r" | "\n…")
          const text = (plan.chunks ?? []).map((t) => `${event(t)}\r\n\r\n`).join("");
          for (const piece of text.split(/(?<=\r\n\r)/)) {
            c.enqueue(enc.encode(piece));
            await sleep(10, init.signal);
          }
        } else {
          for (const [i, t] of (plan.chunks ?? []).entries()) {
            if (plan.failAfter === i) throw new Error("connection reset");
            c.enqueue(enc.encode(`${event(t)}\n\n`));
            await sleep(40, init.signal);
          }
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
let shift = 0; // the clock moved on, to get past earlier rests
const realNow = Date.now;
Date.now = () => realNow() + shift;

const { KeyPool, keysFrom, untilPacificMidnight } = await import("../src/lib/server/keys");
const { generate, geminiKeys, streamWithFallback } = await import("../src/lib/server/gemini");
const { sarvamKeys, speak, transcribe } = await import("../src/lib/server/sarvam");
const { hear, say } = await import("../src/lib/server/voice");
const { answerQuestion } = await import("../src/lib/server/answer");

let bad = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? `\n    ${detail}` : ""}`);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const reset = (p: Record<string, Plan>) => ((plans = p), (calls = []), (bodies.length = 0), (signals.length = 0), (warnings.length = 0));
const outcome = <T,>(p: Promise<T>) => p.then((v) => ({ v, e: "" }), (e: Error) => ({ v: undefined, e: e.message }));

// --- keys
check("keys in number order; a key under two names counts once, under its numbered name",
  same(keysFrom("GEMINI_API_KEY"), [{ key: "k1", name: "GEMINI_API_KEY1" }, { key: "k2", name: "GEMINI_API_KEY_2" }, { key: "k3", name: "GEMINI_API_KEY3" }]));
check("the older single names work too", same(sarvamKeys().keys, ["s1", "s2"]) && sarvamKeys().label("s2") === "SARVAM_API_KEY");
{
  const [a, b, c] = ["SECRET-A", "SECRET-B", "SECRET-C"];
  const pool = new KeyPool([a, b, c]);
  pool.rest(a, 60_000, "m1");
  check("a key resting for one model goes last there only", same(pool.order("m1"), [b, c, a]) && same(pool.order("m2"), [a, b, c]));
  pool.rest(b, 30_000);
  check("a key resting everywhere goes last everywhere, soonest back first", same(pool.order("m1"), [c, b, a]) && same(pool.order("m2", { resting: false }), [a, c]));
  check("the log names a key, never gives it", same(warnings, ["API key 1/3 set aside for 1 min for m1", "API key 2/3 set aside for 30 s"]), warnings.join(" | "));
  check("keys quoted in a message are hidden", pool.hide(`Consumer 'api_key:${b}' has been suspended`) === "Consumer 'api_key:key 2/3' has been suspended");
  warnings.length = 0;
  pool.rest(c, 20_000, "m3", "rate limited");
  pool.rest(c, 20_000, "m3", "rate limited");
  pool.rest(c, 3_600_000, "m3", "daily quota used up");
  check("a rest is logged when it starts and when it gets much longer, not on every request",
    same(warnings, ["API key 3/3 set aside for 20 s for m3: rate limited", "API key 3/3 set aside for 1 h for m3: daily quota used up"]), warnings.join(" | "));
}
check("daily quotas come back at midnight in California, summer and winter",
  untilPacificMidnight(new Date("2026-10-25T06:30:00Z")) === 30 * 60_000 && untilPacificMidnight(new Date("2026-11-15T07:30:00Z")) === 30 * 60_000);

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
shift = 5 * 60_000;
check("a used-up daily quota rests the key for that model until the reset, and says so",
  (!geminiKeys().ready("k1", "A") || untilPacificMidnight() < 5 * 60_000) && geminiKeys().ready("k1", "C")
  && warnings.some((w) => /^Gemini GEMINI_API_KEY1 set aside for .+ for A: daily quota used up$/.test(w)), warnings.join(" | "));
shift = 0;
await stream("a used-up key goes last", ["A"], { "A/k2": { chunks: ["ok"] } }, { model: "A", text: "ok", calls: ["A/k2"] });
await stream("the backup wins when the first stays silent", ["C", "D"], { "C/k1": { wait: 3000, chunks: ["late"] }, "D/k1": { chunks: ["fast"] } }, { model: "D", text: "fast", calls: ["C/k1", "D/k1"] });
await stream("an overloaded model is not tried with its other keys", ["E", "F"], { "E/k1": { status: 503 }, "F/k1": { chunks: ["f"] } }, { model: "F", text: "f", calls: ["E/k1", "F/k1"] });
await stream("rate limited: the next key", ["G"], { "G/k1": { status: 429, quota: "minute" }, "G/k2": { chunks: ["g"] } }, { model: "G", text: "g", calls: ["G/k1", "G/k2"] });
check("a per-minute limit rests the key as long as Google asks", warnings.includes("Gemini GEMINI_API_KEY1 set aside for 20 s for G: rate limited"), warnings.join(" | "));
await stream("breaking off half way is an error", ["J", "K"], { "J/k1": { chunks: ['{"x":', "1}"], failAfter: 1 }, "K/k1": { chunks: ["k"] } }, { error: /connection reset/ });
await stream("nothing works: every failure listed", ["L"], { "L/k1": { status: 429, quota: "day" }, "L/k2": { status: 429, quota: "day" }, "L/k3": { status: 503 } },
  { error: /L GEMINI_API_KEY1: .*L GEMINI_API_KEY_2: .*L GEMINI_API_KEY3: / });
await stream("two backups in a row", ["M", "N", "O"], { "M/k1": { wait: 3000, chunks: ["m"] }, "N/k1": { status: 503 }, "O/k1": { wait: 50, chunks: ["o"] } }, { model: "O", text: "o", never: ["M/k2", "M/k3"] });
await stream("a line ending split between two reads loses nothing", ["P"], { "P/k1": { crlf: true, chunks: ['{"p":', '"1",', '"q":2}'] } }, { model: "P", text: '{"p":"1","q":2}' });

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
await once("used up: the next key", ["Q1"], { "Q1/k1": { status: 429, quota: "day" }, "Q1/k2": answer("p") }, { model: "Q1", calls: ["Q1/k1", "Q1/k2"] });
await once("nothing usable in the answer: the next model", ["Q", "R"], { "Q/k1": { json: { candidates: [{ finishReason: "SAFETY" }] } }, "R/k1": answer("r") }, { model: "R", calls: ["Q/k1", "R/k1"] });
await once("too slow: a backup on the next model", ["S", "T"], { "S/k1": { ...answer("s"), wait: 800 }, "T/k1": answer("t") }, { model: "T", calls: ["S/k1", "T/k1"] });
await once("hung: given up after its time, then the next model", ["U", "V"], { "U/k1": { ...answer("u"), wait: 5000 }, "V/k1": answer("v") }, { model: "V", calls: ["U/k1", "V/k1"] }, { hedgeMs: 5000, timeoutMs: 300 });
{
  // A request that started before a key was set aside does not walk into it afterwards.
  reset({ "W/k1": { status: 503, wait: 100 }, "X/k1": { status: 429, quota: "minute" }, "X/k2": answer("x") });
  const [w, x] = await Promise.all([outcome(generate(["W", "X"], () => ({}), { hedgeMs: 5000 })), outcome(generate(["X"], () => ({}), { hedgeMs: 5000 }))]);
  check("one-off: a key set aside meanwhile is skipped", w.v?.model === "X" && x.v?.model === "X" && calls.filter((c) => c === "X/k1").length === 1, `${w.e} ${x.e} ${calls.join(" ")}`);
}
{
  reset({});
  const ctrl = new AbortController();
  ctrl.abort();
  const r = await outcome(generate(["Y"], () => ({}), { signal: ctrl.signal }));
  check("one-off: nothing sent once the phone has gone", r.e === "aborted" && calls.length === 0, `${r.e}; calls ${calls.join(" ")}`);
}

// --- Sarvam keys
const MP3 = Buffer.from("ID3 fake mp3").toString("base64");
{
  reset({ "text-to-speech/s1": { status: 400, code: "invalid_request_error" }, "text-to-speech/s2": { json: { audios: [MP3] } } });
  const r = await outcome(speak("नमस्ते", "x", 1));
  check("sarvam: a bad request is not tried with the other key", /HTTP 400/.test(r.e) && same(calls, ["text-to-speech/s1"]), `${r.e}; calls ${calls.join(" ")}`);
}
{
  reset({ "text-to-speech/s1": { status: 429, code: "insufficient_quota_error" }, "text-to-speech/s2": { json: { audios: [MP3] } } });
  const r = await speak("नमस्ते", "x", 1);
  check("sarvam: out of credits, the next key", r === MP3 && same(calls, ["text-to-speech/s1", "text-to-speech/s2"]) && warnings.includes("Sarvam SARVAMAI_1 set aside for 6 h: out of credits"), warnings.join(" | "));
  reset({ "text-to-speech/s2": { json: { audios: [MP3] } } });
  await speak("नमस्ते", "x", 1);
  check("sarvam: the key out of credits is skipped afterwards", same(calls, ["text-to-speech/s2"]), calls.join(" "));
}

// --- the voice fallback
const PCM = Buffer.alloc(4800, 1); // 0.1 s of 24 kHz 16-bit mono
const audioAnswer = (mimeType: string, data: Buffer) => ({ json: { candidates: [{ content: { parts: [{ inlineData: { mimeType, data: data.toString("base64") } }] } }] } });
const STEP = "फिर, स्टॉप बटन दबाइए।";
{
  reset({ "text-to-speech/s2": { json: { audios: [MP3] } } });
  const r = await say(STEP, "x", 1);
  check("voice: Sarvam first", r.by === "sarvam" && r.mime === "audio/mpeg" && r.b64 === MP3);
}
{
  // Sarvam's second key runs out too: Gemini speaks, only the words go to it, and its raw PCM becomes a WAV.
  reset({ "text-to-speech/s2": { status: 429, code: "insufficient_quota_error" }, "gemini-3.8-flash-lite-tts/k1": audioAnswer("audio/L16;codec=pcm;rate=24000", PCM) });
  const r = await say(STEP, "x", 0.8);
  const wav = Buffer.from(r.b64, "base64");
  const sent = bodies.find((b) => "generationConfig" in b) as { contents: unknown; generationConfig: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } } } } | undefined;
  check("voice: Gemini takes over when Sarvam is out", r.by === "gemini-3.8-flash-lite-tts" && r.mime === "audio/wav", `${r.by} ${r.mime}`);
  check("voice: Gemini gets the words and nothing else (it reads instructions out loud)",
    same(sent?.contents, [{ role: "user", parts: [{ text: STEP }] }]) && !!sent && !("systemInstruction" in sent)
    && sent.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName === "Sulafat", JSON.stringify(sent));
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
  check("voice: the switch to Gemini is logged once, not for every piece", told === 1 && warnings.filter((w) => w.startsWith("text-to-speech: Sarvam failed")).length === 1, warnings.join(" | "));
}
{
  // Speech to text: Sarvam's keys rest too (out of credits), so Gemini writes it down, given a plain audio type.
  reset({ "gemini-3.1-flash-lite/k1": answer(" “पनीर टिक्का कैसे बनाते हैं?” ") });
  const r = await hear(new Blob([Buffer.alloc(2000)], { type: "audio/webm;codecs=opus" }), "question.webm");
  const sent = bodies[0] as { contents: { parts: { inlineData?: { mimeType: string } }[] }[] } | undefined;
  check("hear: Gemini writes it down when Sarvam can't", r.by === "gemini-3.1-flash-lite" && r.text === "पनीर टिक्का कैसे बनाते हैं?", `${r.by}: ${r.text}`);
  check("hear: the recording's type is made plain for Gemini", sent?.contents[0].parts[0].inlineData?.mimeType === "audio/webm", JSON.stringify(sent?.contents[0].parts[0].inlineData?.mimeType));
}

// --- a whole answer
const ANSWER = JSON.stringify({ kind: "steps", title: "t", intro: "पहले यह।", steps: ["एक।", "दो।", "तीन।"], closing: "बस।" });
const answerPlans = (more: Record<string, Plan>): Record<string, Plan> => ({
  "gemini-3.6-flash/k1": { chunks: [ANSWER.slice(0, 40), ANSWER.slice(40)] },
  "gemini-3.6-flash/k2": { chunks: [ANSWER] },
  "gemini-3.6-flash/k3": { chunks: [ANSWER] },
  ...more,
});
async function answerEvents(signal?: AbortSignal) {
  const events: string[] = [];
  const [log, error] = [console.log, console.error];
  console.log = console.error = () => {};
  const started = realNow();
  try {
    await answerQuestion({ question: "कैसे?", history: [], settings: { voice: "x", pace: 1 }, emit: (e) => void events.push(e.type), signal });
  } finally {
    [console.log, console.error] = [log, error];
  }
  return { events, ms: realNow() - started };
}
{
  // No voice anywhere: every piece's failure reaches the phone before `done`, which it counts on.
  reset(answerPlans({}));
  const { events } = await answerEvents();
  const n = (t: string) => events.filter((e) => e === t).length;
  check("answer: every piece's speech (or its failure) goes out before done", n("segment") === 5 && n("audio_error") === 5 && events.at(-1) === "done", events.join(" "));
}
{
  // The question's time runs out while the speech hangs: the pieces fail and done still goes out.
  reset(answerPlans({ "gemini-3.8-flash-lite-tts/k1": { ...audioAnswer("audio/wav", Buffer.from("RIFF")), wait: 5000 } }));
  const { events, ms } = await answerEvents(AbortSignal.timeout(400));
  check("answer: when time runs out, missing speech fails and done goes out at once",
    events.filter((e) => e === "audio_error").length === 5 && events.at(-1) === "done" && ms < 1500, `${ms} ms: ${events.join(" ")}`);
}
{
  // The answer breaks off after its first piece: the speech still being made for it is stopped.
  reset({
    "gemini-3.6-flash/k1": { chunks: ['{"kind":"steps","title":"t","intro":"पहले यह।","steps":["एक।",', '"दो।"]}'], failAfter: 1 },
    "gemini-3.8-flash-lite-tts/k1": { ...audioAnswer("audio/wav", Buffer.from("RIFF")), wait: 3000 },
  });
  const r = await outcome(answerEvents());
  const speech = signals.filter((s) => s.id.startsWith("gemini-3.8-flash-lite-tts/"));
  check("answer: when it fails half way, its speech still being made is stopped",
    /connection reset/.test(r.e) && speech.length > 0 && speech.every((s) => s.signal?.aborted), `${r.e} | ${speech.length} speech requests, aborted: ${speech.map((s) => s.signal?.aborted)}`);
}

// --- Sarvam's other rules (the clock moved past the six-hour rests above)
shift = 7 * 3_600_000;
{
  reset({ "text-to-speech/s1": { status: 403, code: "invalid_api_key_error" }, "text-to-speech/s2": { json: { audios: [MP3] } } });
  const r = await speak("नमस्ते", "x", 1);
  check("sarvam: a key it doesn't accept rests an hour, the next key answers", r === MP3 && same(calls, ["text-to-speech/s1", "text-to-speech/s2"])
    && warnings.includes("Sarvam SARVAMAI_1 set aside for 1 h: HTTP 403 invalid_api_key_error"), `${calls.join(" ")} | ${warnings.join(" | ")}`);
}
{
  reset({ "text-to-speech/s2": { status: 429, code: "rate_limit_exceeded_error" }, "speech-to-text/s2": { json: { transcript: "हाँ" } } });
  const r = await outcome(speak("नमस्ते", "x", 1));
  const heard = (await outcome(transcribe(new Blob([Buffer.alloc(100)], { type: "audio/webm" }), "q.webm"))).v;
  check("sarvam: a rate limit rests the key 30 s, for that service only", !!r.e && heard === "हाँ"
    && same(calls, ["text-to-speech/s2", "speech-to-text/s2"]) && warnings.includes("Sarvam SARVAM_API_KEY set aside for 30 s for TTS: HTTP 429 rate_limit_exceeded_error"),
    `${r.e} | ${calls.join(" ")} | ${warnings.join(" | ")}`);
}
shift = 9 * 3_600_000;
{
  // Sarvam not answering: that service rests on every key, and Gemini speaks straight away.
  reset({ "text-to-speech/s1": { throws: "timeout" }, "text-to-speech/s2": { json: { audios: [MP3] } }, "gemini-3.8-flash-lite-tts/k1": audioAnswer("audio/wav", Buffer.from("RIFF")) });
  const r = await say("नमस्ते", "x", 1);
  check("sarvam: no answer in time sets that service aside on every key, and Gemini speaks",
    r.by === "gemini-3.8-flash-lite-tts" && same(calls.filter((c) => c.startsWith("text-to-speech/")), ["text-to-speech/s1"])
    && warnings.includes("Sarvam SARVAMAI_1 set aside for 2 min for TTS: no answer in time") && warnings.includes("Sarvam SARVAM_API_KEY set aside for 2 min for TTS: no answer in time"),
    `${r.by} | ${calls.join(" ")} | ${warnings.join(" | ")}`);
  reset({ "speech-to-text/s1": { json: { transcript: "हाँ" } } });
  const heard = await hear(new Blob([Buffer.alloc(100)], { type: "audio/webm" }), "q.webm");
  check("sarvam: ...while speech to text still uses Sarvam", heard.by === "sarvam" && same(calls, ["speech-to-text/s1"]), `${heard.by} ${calls.join(" ")}`);
}

// --- a Gemini key Google rejects (last: key 1 then rests for every model)
{
  reset({ "BK/k1": { status: 400, message: "API key not valid. Please pass a valid API key." }, "BK/k2": answer("bk") });
  const r = await outcome(generate(["BK"], () => ({}), { hedgeMs: 5000 }));
  check("gemini: a rejected key rests an hour, and the same model is asked with the next key", r.v?.model === "BK" && same(calls, ["BK/k1", "BK/k2"])
    && warnings.some((w) => w.startsWith("Gemini GEMINI_API_KEY1 set aside for 1 h: HTTP 400 API key not valid")), `${r.e} | ${calls.join(" ")} | ${warnings.join(" | ")}`);
  reset({ "BK2/k2": answer("bk2") });
  const r2 = await outcome(generate(["BK2"], () => ({}), { hedgeMs: 5000 }));
  check("gemini: ...for every model", r2.v?.model === "BK2" && same(calls, ["BK2/k2"]), `${r2.e} | ${calls.join(" ")}`);
}
{
  reset({ "SUS/k2": { status: 403, message: "Permission denied: Consumer 'api_key:k2' has been suspended." }, "SUS/k3": answer("s") });
  const r = await outcome(generate(["SUS"], () => ({}), { hedgeMs: 5000 }));
  check("gemini: a key Google quotes in an error never reaches the log", r.v?.model === "SUS" && warnings.some((w) => w.includes("api_key:GEMINI_API_KEY_2"))
    && !warnings.some((w) => w.includes("api_key:k2")), `${r.e} | ${warnings.join(" | ")}`);
  // ...nor the error the routes log when nothing works
  reset({ "SUS2/k3": { status: 403, message: "Permission denied: Consumer 'api_key:k3' has been suspended." } });
  const r2 = await outcome(generate(["SUS2"], () => ({}), { hedgeMs: 5000 }));
  check("gemini: ...nor the error when every key fails", r2.e.includes("api_key:GEMINI_API_KEY3") && !r2.e.includes("api_key:k3"), r2.e);
}

console.log(bad ? `${bad} FAILED` : "all pass");
process.exitCode = bad ? 1 : 0;
