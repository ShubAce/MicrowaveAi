// Sarvam AI: speech-to-text (Saaras v4) and text-to-speech (Bulbul v4 Flash), called over REST.

import { DEFAULT_PACE, DEFAULT_VOICE, isVoiceId } from "../voices";

const BASE = "https://api.sarvam.ai";
const key = () => process.env.SARVAM_API_KEY ?? process.env.SARVAMAI ?? "";

/** Words worth recognising well (saaras:v4 allows up to 50, 64 characters each). */
const KEYTERMS = [
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

/** Sarvam accepts "audio/webm" but rejects "audio/webm;codecs=opus", which is what phones record. */
const ACCEPTED_TYPES = new Set(["audio/webm", "video/webm", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/opus",
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/aac", "audio/flac"]);

export async function transcribe(audio: Blob, filename: string, signal?: AbortSignal): Promise<string> {
  const base = audio.type.split(";")[0].trim().toLowerCase();
  const type = ACCEPTED_TYPES.has(base) ? base : "application/octet-stream";
  const form = new FormData();
  form.append("file", new Blob([await audio.arrayBuffer()], { type }), filename);
  form.append("model", "saaras:v4");
  form.append("mode", "transcribe");
  form.append("language_code", "hi-IN");
  form.append("keyterms", JSON.stringify(KEYTERMS));
  const res = await fetch(`${BASE}/speech-to-text`, {
    method: "POST",
    headers: { "api-subscription-key": key() },
    body: form,
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new SarvamError(`STT HTTP ${res.status} ${JSON.stringify(json).slice(0, 500)}`, res.status);
  return String(json.transcript ?? "").trim();
}

export const safeVoice = (v: unknown): string => (isVoiceId(v) ? v : DEFAULT_VOICE);

export function safePace(p: unknown): number {
  const n = Number(p);
  return Number.isFinite(n) ? Math.min(1.2, Math.max(0.7, n)) : DEFAULT_PACE;
}

/** Returns base64 MP3. */
export async function speak(text: string, voice: string, pace: number, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${BASE}/text-to-speech`, {
    method: "POST",
    headers: { "api-subscription-key": key(), "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 2400),
      language_code: "hi-IN",
      model: "bulbul:v4-flash",
      speaker: safeVoice(voice),
      pace: safePace(pace),
      enable_preprocessing: true,
      output_audio_codec: "mp3",
      speech_sample_rate: 24000,
    }),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(json.audios)) {
    throw new SarvamError(`TTS HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`, res.status);
  }
  return json.audios.join("");
}
