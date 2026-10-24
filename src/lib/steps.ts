// What picture a step gets, worked out from its markup ([STOP], {5-3}) and everyday Hindi words.
// Shared by the screen and the tests; no React here.

import type { ButtonId } from "./buttons";
import { parseMarkup } from "./markup";

/** How a button is used in a step. */
export type PressHow = "tap" | "repeat" | "hold" | "turn";
export interface Press {
  id: ButtonId;
  how: PressHow;
}

/** What the dial is turned to choose. */
export type DialFor = "code" | "weight" | "time" | "temperature" | "power" | null;

export type Accessory =
  | "bowl" | "plate" | "glass_tray" | "low_rack" | "high_rack" | "rack" | "tawa" | "tawa_rack"
  | "air_fry_tray" | "rotisserie" | "packet";

/** What the display shows (or stops showing) during the step. */
export interface Readout {
  values: string[];
  /** The value goes away (e.g. "until Loc disappears"). */
  goes: boolean;
}

export type StepScene =
  | { kind: "panel"; presses: Press[]; readout?: Readout; dialFor: DialFor }
  | { kind: "place"; accessory: Accessory }
  | { kind: "beep"; action: "flip" | "stir" | "wait" | "add" | "place" | "open"; accessory?: Accessory; minutes?: string; then: ButtonId[] }
  | { kind: "stir" }
  | { kind: "flip" }
  | { kind: "wait"; minutes?: string }
  | { kind: "display"; readout: Readout }
  | { kind: "ready" };

const HOLD = /(दबाकर रख|दबाए रख|दबाये रख|सेकंड तक दबा|होल्ड)/;
const UNTIL = /(तब तक|जब तक)/;
// Putting something in or on: only the doing forms, so "रखने से पहले" (before putting) doesn't count.
const PLACE = /(रखिए|रखें|रखकर|रख दीजिए|रख दें|डालिए|डालें|डालकर|फैलाकर|भरिए|भरें)/;
const NOT_PLACE = /(ध्यान रख|खाली रख|याद रख)/g;
const STIR = /(चलाइए|चला लीजिए|चला लें|चलाएं|चलाएँ|चलाकर|मिलाइए|मिला लीजिए|मिलाएं|हिलाइए)/;
const WAIT = /(रहने दीजिए|रहने दें|रहने दे|रुकिए|इंतज़ार|इंतजार)/;
const GOES = /(हट|गायब|बंद हो)/;

export function accessoryOf(text: string): Accessory {
  if (/एयर फ्राई (ट्रे|पैन)/.test(text)) return "air_fry_tray";
  if (/(तवा|तवे)/.test(text)) return /रैक/.test(text) ? "tawa_rack" : "tawa";
  if (/हाई रैक/.test(text)) return "high_rack";
  if (/लो रैक/.test(text)) return "low_rack";
  if (/रैक/.test(text)) return "rack";
  if (/(रोटिसरी|सीख)/.test(text)) return "rotisserie";
  if (/(पैकेट|थैली)/.test(text)) return "packet";
  if (/(प्लेट|थाली)/.test(text)) return "plate";
  if (/(बाउल|कटोर|बर्तन|जार|डिब्बे)/.test(text)) return "bowl";
  if (/ग्लास ट्रे/.test(text)) return "glass_tray";
  return "plate";
}

function dialPurpose(text: string, hasDisplay: boolean): DialFor {
  if (hasDisplay) return "code"; // the value it shows is what the dial picks
  if (/वज़न|वजन/.test(text)) return "weight";
  if (/(तापमान|डिग्री|°)/.test(text)) return "temperature";
  if (/(पावर|वॉट|W\b)/.test(text)) return "power";
  if (/(समय|मिनट|सेकंड)/.test(text)) return "time";
  if (/कोड/.test(text)) return "code";
  return null;
}

export function describeStep(markup: string): StepScene | null {
  const pieces = parseMarkup(markup);
  const text = pieces.map((p) => (p.kind === "text" ? p.text : " ")).join("").replace(/\s+/g, " ");
  const values = [...new Set(pieces.flatMap((p) => (p.kind === "display" ? [p.text] : [])))].slice(0, 2);
  const readout = values.length ? { values, goes: GOES.test(text) } : undefined;
  const buttons = [...new Set(pieces.flatMap((p) => (p.kind === "button" ? [p.id] : [])))];
  const places = PLACE.test(text.replace(NOT_PLACE, ""));

  if (/बीप/.test(text)) {
    const action = /पलट/.test(text) ? "flip" : STIR.test(text) ? "stir"
      : WAIT.test(text) || /मिनट/.test(text) ? "wait" : places ? "place" : /(डाल|मिला)/.test(text) ? "add" : "open";
    return {
      kind: "beep",
      action,
      accessory: action === "place" ? accessoryOf(text) : undefined,
      minutes: action === "wait" ? text.match(/(\d+)\s*मिनट/)?.[1] : undefined,
      then: buttons,
    };
  }

  if (buttons.length) {
    // How each button is pressed is said in the words that follow it, up to the next button.
    const presses: Press[] = [];
    pieces.forEach((p, i) => {
      if (p.kind !== "button" || presses.some((x) => x.id === p.id)) return;
      let after = "";
      for (let j = i + 1; j < pieces.length; j++) {
        const q = pieces[j];
        if (q.kind === "button") break;
        if (q.kind === "text") after += q.text;
      }
      const how: PressHow = p.id === "DIAL" ? "turn" : HOLD.test(after) ? "hold" : UNTIL.test(after) ? "repeat" : "tap";
      presses.push({ id: p.id, how });
    });
    return { kind: "panel", presses, readout, dialFor: buttons.includes("DIAL") ? dialPurpose(text, !!readout) : null };
  }

  if (places) return { kind: "place", accessory: accessoryOf(text) };
  if (/तैयार/.test(text)) return { kind: "ready" };
  if (/पलट/.test(text)) return { kind: "flip" };
  if (STIR.test(text)) return { kind: "stir" };
  if (WAIT.test(text)) return { kind: "wait", minutes: text.match(/(\d+)\s*मिनट/)?.[1] };
  if (readout) return { kind: "display", readout };
  return null;
}
