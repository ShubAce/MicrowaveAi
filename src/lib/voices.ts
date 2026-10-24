// Sarvam Bulbul v4 Flash voices offered in settings. Sarvam renames voices from time to time;
// an unknown id makes text-to-speech fail, so check this list against the live one when it does.

export const VOICES = [
  { id: "sarika_hi_conversation", name: "सारिका", note: "बातचीत जैसी" },
  { id: "shalini_hi_companion", name: "शालिनी", note: "अपनेपन वाली" },
  { id: "roopa_hi_companion", name: "रूपा", note: "साथी जैसी" },
  { id: "ritu_hi_customer_warm", name: "रितु", note: "प्यार भरी" },
  { id: "simran_hi_assistant", name: "सिमरन", note: "मददगार" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];
export const DEFAULT_VOICE: VoiceId = "sarika_hi_conversation";

export const PACES = [
  { value: 0.85, label: "धीरे" },
  { value: 0.95, label: "सामान्य" },
  { value: 1.05, label: "थोड़ा तेज़" },
] as const;
export const DEFAULT_PACE = 0.95;

export const isVoiceId = (v: unknown): v is VoiceId => VOICES.some((x) => x.id === v);
