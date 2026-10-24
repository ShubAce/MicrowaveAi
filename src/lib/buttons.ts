// The buttons on the MJEN286UGWF control panel. Answers refer to them as tokens like [STOP];
// the screen draws the printed English label and the voice says the Hindi name.

export type ButtonId =
  | "COOK_MODE"
  | "CHARCOAL"
  | "HEALTHY_HEART"
  | "ROTI_GHEE"
  | "AIR_FRY"
  | "KIDS_DAIRY"
  | "DIAL"
  | "STOP"
  | "START";

export interface PanelButton {
  id: ButtonId;
  /** Exactly as printed on the panel. */
  label: string;
  /** Small print under the label on the panel, if any. */
  sub?: string;
  /** How the voice says it (works before "को" as well as on its own). */
  spoken: string;
  /** Short Hindi hint shown under the chip. */
  hint: string;
}

export const BUTTONS: Record<ButtonId, PanelButton> = {
  COOK_MODE: { id: "COOK_MODE", label: "Cook Mode", sub: "*Wi-Fi", spoken: "कुक मोड बटन", hint: "कुक मोड" },
  CHARCOAL: { id: "CHARCOAL", label: "Charcoal/Indian Cuisine", spoken: "चारकोल बटन", hint: "चारकोल" },
  HEALTHY_HEART: { id: "HEALTHY_HEART", label: "Healthy Heart", spoken: "हेल्दी हार्ट बटन", hint: "हेल्दी हार्ट" },
  ROTI_GHEE: { id: "ROTI_GHEE", label: "Indian Roti Basket/Ghee", spoken: "रोटी-घी बटन", hint: "रोटी-घी" },
  AIR_FRY: { id: "AIR_FRY", label: "Air Fry/Low Calorie", spoken: "एयर फ्राई बटन", hint: "एयर फ्राई" },
  KIDS_DAIRY: { id: "KIDS_DAIRY", label: "Kids'/Dairy Delight", spoken: "किड्स-डेयरी बटन", hint: "किड्स-डेयरी" },
  DIAL: { id: "DIAL", label: "डायल", sub: "− / +", spoken: "डायल", hint: "गोल डायल" },
  STOP: { id: "STOP", label: "STOP", sub: "Cancel", spoken: "स्टॉप बटन", hint: "स्टॉप" },
  START: { id: "START", label: "START", sub: "Select/+30 sec", spoken: "स्टार्ट बटन", hint: "स्टार्ट" },
};

export const isButtonId = (s: string): s is ButtonId => s in BUTTONS;
