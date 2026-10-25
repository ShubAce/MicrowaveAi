// Sarvam AI: speech-to-text (Saaras v4) and text-to-speech (Bulbul v4 Flash), called over REST.
// Several keys can be set (SARVAMAI_1, SARVAMAI_2, ...): the next one is used when a key's credits
// run out, it is rate limited, or Sarvam fails for it.

import { DEFAULT_PACE, DEFAULT_VOICE, isVoiceId } from "../voices";
import { KeyPool, keyLabel, keysFrom } from "./keys";

const BASE = "https://api.sarvam.ai";

let pool: KeyPool | null = null;
/** SARVAMAI, SARVAMAI_1, SARVAMAI_2, ... (or SARVAM_API_KEY, SARVAM_API_KEY_1, ...). */
export const sarvamKeys = () => (pool ??= new KeyPool(keysFrom("SARVAMAI", "SARVAM_API_KEY"), "Sarvam"));

/** Words worth recognising well (saaras:v4 allows up to 50, 64 characters each). */
export const KEYTERMS = [
  "माइक्रोवेव", "एयर फ्राई", "ग्रिल", "कन्वेक्शन", "चारकोल", "रोटिसरी", "डीफ्रॉस्ट", "प्रीहीट", "चाइल्ड लॉक",
  "स्टार्ट", "स्टॉप", "कुक मोड", "हेल्दी हार्ट", "रोटी बास्केट", "डायल", "मल्टीकुक तवा", "रैक", "ग्लास ट्रे",
  "एयर फ्राई ट्रे", "डिस्प्ले", "पनीर टिक्का", "तंदूरी", "बिरयानी", "पराठा", "घी", "केक", "पिज़्ज़ा", "पॉपकॉर्न",
  "पापड़", "समोसा", "फ्रेंच फ्राइज़", "स्टीम क्लीन", "वाई-फाई", "थिंक्यू", "कन्वेक्शन कॉम्बी", "ग्रिल कॉम्बी",
  "किड्स डेयरी", "लो कैलोरी", "इंडियन क्विज़ीन", "पाश्चराइज़", "कुकीज़", "नगेट्स", "टिक्की", "कबाब", "मठरी",
  "पंजीरी", "ढोकला", "कीप वॉर्म", "नॉन वेज", "LG",
];

export class SarvamError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Runs `call` with each key in turn until one works. Sarvam's answers decide how long a key rests:
 * credits used up (429 insufficient_quota_error) six hours, a key it doesn't accept (403) an hour,
 * a rate limit (429/503) half a minute. A problem with the request itself (400/413/422) is not the
 * key's fault, so it is not retried with the others.
 */
async function withKey<T>(
  what: string,
  signal: AbortSignal | undefined,
  call: (key: string) => Promise<Response>,
  read: (json: Record<string, unknown>) => T | null,
): Promise<T> {
  const keys = sarvamKeys();
  if (!keys.size) throw new SarvamError(`${what}: no Sarvam API key set`, 401);
  let last: Error | null = null;
  // Keys that are resting are skipped: when none is left, Gemini takes over straight away.
  for (const key of keys.order("*", { resting: false })) {
    if (!keys.ready(key)) continue; // set aside meanwhile, by a request running alongside
    let res: Response;
    try {
      res = await call(key);
    } catch (e) {
      if (signal?.aborted) throw e; // the phone gave up; a timeout just moves on to the next key
      last = new SarvamError(`${what} ${keyLabel(keys, key)}: ${(e as Error).message}`, 504);
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const value = res.ok ? read(json) : null;
    if (value !== null) return value;
    const code = String((json.error as { code?: string } | undefined)?.code ?? "");
    const error = new SarvamError(`${what} ${keyLabel(keys, key)}: HTTP ${res.status} ${code || JSON.stringify(json).slice(0, 200)}`, res.status);
    if ([400, 413, 422].includes(res.status)) throw error;
    if (code === "insufficient_quota_error") keys.rest(key, 6 * 3_600_000, "*", "out of credits");
    else if (res.status === 401 || res.status === 403) keys.rest(key, 3_600_000, "*", `HTTP ${res.status} ${code}`);
    else if (res.status === 429 || res.status === 503) keys.rest(key, 30_000, "*", `HTTP ${res.status} ${code}`);
    last = error;
  }
  throw last ?? new SarvamError(`${what}: every Sarvam key is resting (out of credits or rate limited)`, 429);
}

/** Aborts when the caller gives up or after `ms`. */
const deadline = (signal: AbortSignal | undefined, ms: number) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);

/** Sarvam accepts "audio/webm" but rejects "audio/webm;codecs=opus", which is what phones record. */
const ACCEPTED_TYPES = new Set(["audio/webm", "video/webm", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/opus",
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/aac", "audio/flac"]);

export async function transcribe(audio: Blob, filename: string, signal?: AbortSignal): Promise<string> {
  const base = audio.type.split(";")[0].trim().toLowerCase();
  const type = ACCEPTED_TYPES.has(base) ? base : "application/octet-stream";
  const bytes = await audio.arrayBuffer();
  return withKey("STT", signal, (key) => {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), filename);
    form.append("model", "saaras:v4");
    form.append("mode", "transcribe");
    form.append("language_code", "hi-IN");
    form.append("keyterms", JSON.stringify(KEYTERMS));
    return fetch(`${BASE}/speech-to-text`, { method: "POST", headers: { "api-subscription-key": key }, body: form, signal: deadline(signal, 15000) });
  }, (json) => (typeof json.transcript === "string" ? json.transcript.trim() : null));
}

export const safeVoice = (v: unknown): string => (isVoiceId(v) ? v : DEFAULT_VOICE);

export function safePace(p: unknown): number {
  const n = Number(p);
  return Number.isFinite(n) ? Math.min(1.2, Math.max(0.7, n)) : DEFAULT_PACE;
}

/** Returns base64 MP3. */
export async function speak(text: string, voice: string, pace: number, signal?: AbortSignal): Promise<string> {
  const body = JSON.stringify({
    text: text.slice(0, 2400),
    language_code: "hi-IN",
    model: "bulbul:v4-flash",
    speaker: safeVoice(voice),
    pace: safePace(pace),
    enable_preprocessing: true,
    output_audio_codec: "mp3",
    speech_sample_rate: 24000,
  });
  return withKey("TTS", signal, (key) => fetch(`${BASE}/text-to-speech`, {
    method: "POST",
    headers: { "api-subscription-key": key, "Content-Type": "application/json" },
    body,
    signal: deadline(signal, 15000),
  }), (json) => (Array.isArray(json.audios) && json.audios.length ? json.audios.join("") : null));
}
