// Speech in and out. Sarvam first (its Hindi voices are the ones she knows); when every Sarvam key
// is out of credit, rate limited or failing, Gemini takes over: it writes down what she said, and its
// text-to-speech models read the answer aloud.

import { generate, modelsFrom, thinkingFor, type GeminiResponse } from "./gemini";
import { KEYTERMS, speak, transcribe } from "./sarvam";

/** Quick text models to write down a short question. */
const STT_MODELS = ["gemini-3.1-flash-lite", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview"];
/** Text-to-speech models, fastest first. */
const TTS_MODELS = ["gemini-3.8-flash-lite-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-3.8-flash-tts"];
/** A warm female voice, like सखी's Sarvam voices. */
const TTS_VOICE = () => process.env.GEMINI_TTS_VOICE || "Sulafat";

const STT_PROMPT =
  "This is a short spoken question, in Hindi with perhaps a few English words, from a woman asking about her LG " +
  "microwave oven. Write down exactly what she says, in Devanagari script. Reply with her words only. If nothing " +
  `is said, reply with nothing. Words that may come up: ${KEYTERMS.join(", ")}.`;

/** Gemini wants a plain audio type: "audio/webm;codecs=opus" → "audio/webm", an m4a → "audio/mp4". */
function audioType(type: string, filename: string): string {
  const base = type.split(";")[0].trim().toLowerCase();
  if (base === "video/webm") return "audio/webm";
  if (base === "audio/x-m4a" || /\.m4a$/i.test(filename)) return "audio/mp4";
  if (base.startsWith("audio/")) return base;
  return /\.ogg$/i.test(filename) ? "audio/ogg" : /\.wav$/i.test(filename) ? "audio/wav" : "audio/webm";
}

const textOf = (json: GeminiResponse) =>
  (json.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();

const told = new Map<string, { why: string; at: number }>();

/** Log that Gemini took over once, not for every piece: again only when the reason changes, or after 10 minutes. */
function fellBack(what: string, e: unknown) {
  const why = (e as Error).message;
  const last = told.get(what);
  if (last?.why === why && Date.now() - last.at < 10 * 60_000) return;
  told.set(what, { why, at: Date.now() });
  console.warn(`${what}: Sarvam failed, using Gemini (${why})`);
}

/** What she said, and who wrote it down. */
export async function hear(audio: Blob, filename: string, signal?: AbortSignal): Promise<{ text: string; by: string }> {
  try {
    return { text: await transcribe(audio, filename, signal), by: "sarvam" };
  } catch (e) {
    if (signal?.aborted) throw e;
    fellBack("speech-to-text", e);
  }
  const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const { model, json } = await generate(modelsFrom("GEMINI_STT_MODELS", STT_MODELS), (m) => ({
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: audioType(audio.type, filename), data } }, { text: STT_PROMPT }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 300, thinkingConfig: thinkingFor(m) },
  }), { signal, timeoutMs: 20000, hedgeMs: 6000, accept: (j) => j.candidates?.[0]?.finishReason !== "SAFETY" });
  return { text: textOf(json).replace(/^["“”'\s]+|["“”'\s]+$/g, ""), by: model };
}

/** A WAV file around raw 16-bit PCM (what some Gemini speech models send). */
function wav(pcm: Buffer, rate: number, channels: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * channels * 2, 28);
  h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const audioPart = (json: GeminiResponse) => json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;

/** Speech for one piece of an answer: base64 audio, its type, and who spoke it. */
export async function say(text: string, voice: string, pace: number, signal?: AbortSignal): Promise<{ b64: string; mime: string; by: string }> {
  try {
    return { b64: await speak(text, voice, pace, signal), mime: "audio/mpeg", by: "sarvam" };
  } catch (e) {
    if (signal?.aborted) throw e;
    fellBack("text-to-speech", e);
  }
  // Only the words go in. Told how to speak ("Read this aloud in Hindi, warmly…"), these models
  // sometimes say the instruction out loud too, so the voice keeps its own calm pace.
  const { model, json } = await generate(modelsFrom("GEMINI_TTS_MODELS", TTS_MODELS), () => ({
    contents: [{ role: "user", parts: [{ text: text.slice(0, 1200) }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE() } } },
    },
  }), { signal, timeoutMs: 25000, hedgeMs: 10000, accept: (j) => !!audioPart(j) });
  const part = audioPart(json)!;
  const bytes = Buffer.from(part.data, "base64");
  // The newer models send a complete WAV file; the older ones send raw PCM ("audio/L16;codec=pcm;rate=24000").
  const out = bytes.subarray(0, 4).toString() === "RIFF" ? bytes
    : wav(bytes, Number(part.mimeType.match(/rate=(\d+)/)?.[1] ?? 24000), Number(part.mimeType.match(/channels=(\d+)/)?.[1] ?? 1));
  return { b64: out.toString("base64"), mime: "audio/wav", by: model };
}
