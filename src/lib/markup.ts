// Answer text markup shared by the screen and the voice:
//   [STOP]      a panel button (see buttons.ts)
//   {5-3}       what the microwave's display shows
// Everything else is plain Hindi.

import { BUTTONS, isButtonId, type ButtonId } from "./buttons";

export type Piece =
  | { kind: "text"; text: string }
  | { kind: "button"; id: ButtonId }
  | { kind: "display"; text: string };

const TOKEN = /\[([A-Za-z_]+)\]|\{([^{}]{1,16})\}/g;

/** Accessory ids the model sometimes writes into the text instead of Hindi words. */
const ACCESSORY_HI: Record<string, string> = {
  glass_tray: "ग्लास ट्रे",
  rotating_ring: "घूमने वाली रिंग",
  high_rack: "हाई रैक",
  low_rack: "लो रैक",
  multicook_tawa: "मल्टीकुक तवा",
  air_fry_tray: "एयर फ्राई ट्रे",
  rotisserie: "रोटिसरी",
  microwave_safe_bowl: "माइक्रोवेव-सेफ बाउल",
  microwave_safe_plate: "माइक्रोवेव-सेफ प्लेट",
};
const BARE_ACCESSORY = new RegExp(`\\b(${Object.keys(ACCESSORY_HI).join("|")})\\b`, "gi");

export const accessoryName = (id: string) => ACCESSORY_HI[id.toLowerCase()] ?? id;

export function parseMarkup(markup: string): Piece[] {
  markup = markup
    .replace(/\[([A-Za-z_]+)\]/g, (m, id: string) => (isButtonId(id) ? m : accessoryName(id)))
    .replace(BARE_ACCESSORY, (m) => accessoryName(m));
  const pieces: Piece[] = [];
  let last = 0;
  for (const m of markup.matchAll(TOKEN)) {
    if (m.index > last) pieces.push({ kind: "text", text: markup.slice(last, m.index) });
    if (m[1] !== undefined) {
      pieces.push(isButtonId(m[1]) ? { kind: "button", id: m[1] } : { kind: "text", text: accessoryName(m[1]) });
    } else {
      pieces.push({ kind: "display", text: m[2].trim() });
    }
    last = m.index + m[0].length;
  }
  if (last < markup.length) pieces.push({ kind: "text", text: markup.slice(last) });
  return pieces;
}

export function buttonsIn(markup: string): ButtonId[] {
  return parseMarkup(markup).flatMap((p) => (p.kind === "button" ? [p.id] : []));
}

/** Plain readable text, e.g. for history sent back to the model. */
export function toPlain(markup: string): string {
  return parseMarkup(markup)
    .map((p) => (p.kind === "button" ? BUTTONS[p.id].label : p.text))
    .join("");
}

const DISPLAY_WORDS: Record<string, string> = {
  loc: "लॉक",
  end: "एंड",
  grll: "ग्रिल",
  grill: "ग्रिल",
  preheat: "प्रीहीट",
};

/** How to say something shown on the display. */
function speakDisplay(raw: string): string {
  const s = raw.replace(/\s+/g, "");
  const word = DISPLAY_WORDS[s.toLowerCase()];
  if (word) return word;
  const combi = s.match(/^(GC|CC)-?(\d)$/i);
  if (combi) return `${combi[1].toUpperCase() === "GC" ? "जी सी" : "सी सी"} ${combi[2]}`;
  const temp = s.match(/^(\d{2,3})\s*(°C|℃|°|C)$/i);
  if (temp) return `${temp[1]} डिग्री`;
  const kg = s.match(/^(\d?)\.(\d)$/); // weights shown in kg, e.g. 0.4
  if (kg) {
    const grams = Number(`${kg[1] || 0}.${kg[2]}`) * 1000;
    return grams === 500 ? "आधा किलो" : grams === 1000 ? "एक किलो" : `${grams} ग्राम`;
  }
  return s.replace(/-/g, " ");
}

/** Text for the Hindi voice: buttons by their spoken names, no symbols the voice might read out. */
export function toSpeech(markup: string): string {
  return parseMarkup(markup)
    .map((p) => {
      if (p.kind === "button") return BUTTONS[p.id].spoken;
      if (p.kind === "display") return speakDisplay(p.text);
      return p.text;
    })
    .join("")
    .replace(/\*+/g, "")
    .replace(/[\/|→•]/g, " ")
    .replace(/\s+([,।?!])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
