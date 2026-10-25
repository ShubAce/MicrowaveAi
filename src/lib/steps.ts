// What picture a step gets, worked out from its markup ([STOP], {5-3}) and everyday Hindi words.
// A step is read clause by clause ("…दबाइए, फिर…", "…लाइए और…"), so every button gets the words
// that belong to it. Shared by the screen and the tests; no React here.

import type { ButtonId } from "./buttons";
import { parseMarkup } from "./markup";

/** How a button is used in a step. */
export type PressHow = "tap" | "repeat" | "hold" | "turn";

/** What the dial is turned to choose. */
export type DialFor = "code" | "weight" | "time" | "temperature" | "power" | null;

export type Accessory =
  | "bowl" | "plate" | "glass_tray" | "low_rack" | "high_rack" | "rack"
  | "tawa" | "tawa_high" | "tawa_low" | "tawa_rack" | "air_fry_tray" | "rotisserie" | "popcorn";

/** One thing to do, in the order the step says it. */
export type Action =
  | { kind: "press"; id: ButtonId; how: PressHow; times?: number; seconds?: number; dialFor?: DialFor }
  | { kind: "stir" }
  | { kind: "flip" }
  | { kind: "wait"; minutes?: string }
  | { kind: "place"; accessory: Accessory | null }
  | { kind: "takeout" };

export interface Shown {
  text: string;
  /** The value goes away (e.g. "until Loc disappears"). */
  goes: boolean;
}

/** What the display shows (or stops showing) during the step. */
export interface Readout {
  values: Shown[];
  /** Between each value and the next: "or" either one (5-3 or 5-2), "then" one after the other
   *  (group 1, then code 1-13). */
  joins: ("or" | "then")[];
}

export type BeepAction = "flip" | "add" | "stir" | "place" | "takeout" | "wait" | "open";

export type StepScene =
  | { kind: "panel"; actions: Action[]; readout?: Readout }
  | { kind: "place"; accessory: Accessory | null }
  /** Food spread on the tawa or the air-fry tray outside the oven (e.g. while it preheats empty). */
  | { kind: "arrange"; accessory: "tawa" | "air_fry_tray" }
  | { kind: "pour"; accessory: Accessory | null }
  | { kind: "takeout"; gloves: boolean }
  | { kind: "beep"; action: BeepAction; accessory?: Accessory | null; minutes?: string; then: ButtonId[] }
  | { kind: "stir"; outsideIn: boolean }
  | { kind: "flip" }
  | { kind: "wait"; minutes?: string }
  | { kind: "display"; readout: Readout }
  | { kind: "ready" };

// Placeholders for the tokens while the words are read: ⟦b:STOP⟧ and ⟦d:0⟧ (the first display value).
const TOKEN = /⟦([bd]):([^⟧]+)⟧/g;
// Where one instruction ends and the next begins: ।, comma, "फिर", or "और" after a request ("लाइए और").
const BOUNDARY = /\s*(?:[।?!;,]|(?<=(?:इए|िए|एं|एँ|ें|ये))\s+और(?:\s+फिर)?(?=\s)|(?:^|\s)फिर(?=\s|$))\s*/;

const NUM = "\\d+|एक|दो|तीन|चार|पाँच|पांच|छह|छः|सात|आठ|नौ|दस|ग्यारह|बारह|तेरह|चौदह|पंद्रह|पन्द्रह|सोलह|सत्रह|अठारह|उन्नीस|बीस";
const COUNT: Record<string, number> = {
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, "छः": 6, सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12,
  तेरह: 13, चौदह: 14, पंद्रह: 15, पन्द्रह: 15, सोलह: 16, सत्रह: 17, अठारह: 18, उन्नीस: 19, बीस: 20,
};
const countOf = (w: string) => COUNT[w] ?? Number(w);
/** Holding a button: "दबाकर रखिए", or a few seconds (this oven's holds are 3 s, and 8 s for its
 *  self-test). "30 सेकंड के लिए START दबाइए" is a single tap of the quick start, not a hold. */
const HOLD = /((?:दबा\s*कर|दबाए[ँं]?|दबाये)\s*रख(?!ने\s*की\s*(?:ज़|ज़|ज)रूरत\s*नहीं)|दबाए\s*हुए|(?<![\d.])(?:[1-9]|दो|तीन|चार|पाँच|पांच|आठ)\s*सेकंड\s*(?:तक\s*|के\s*लिए\s*)?दबा|होल्ड|hold)/i;
const SECONDS = new RegExp(`(?<![\\d.])(${NUM})\\s*सेकंड`);
const UNTIL = /(तब\s*तक|जब\s*तक|(?:आने|दिखने|आ\s*जाने)\s*तक)/;
/** The press itself goes on ("दबाइए", "दबाते रहिए"), unlike "दबाकर … आने तक इंतज़ार कीजिए". */
const PRESSES_ON = /दबा(?:इए|इये|एं|एँ|ें|ना|ते\s*रह|ते\s*जा)/;
const AGAIN = /(बार-बार|बार\s+बार|दबाते\s*रह|कई\s*बार|कुछ\s*बार|जितनी\s*बार)/;
const TIMES = new RegExp(`(?<![\\p{L}\\p{M}])(${NUM})(?:\\s*(?:से|-|या)\\s*(${NUM}))?\\s*बार(?![\\p{L}\\p{M}])`, "u");

/** A press the step forbids or replaces: "[STOP] मत दबाइए", "[START] दबाने की बजाय …", "बिना [STOP] दबाए". */
const FILLER = "(?:को|बटन|भी|कभी|सिर्फ|बस|बार-बार|बार\\s+बार|दोबारा|फिर\\s+से|(?:\\d+|एक|दो|तीन|चार|पाँच|पांच)\\s+बार)";
const FORBIDDEN_AFTER = new RegExp(
  `^\\s*(?:${FILLER}\\s+)*(?:नहीं\\s*(?:[,।;]|$)|(?:मत|न|नहीं)\\s+दबा|दबा(?:ने|ना)\\s+(?:की|के)\\s+(?:बजाय|बजाए|जगह|बदले)|दबाने\\s+की\\s+(?:ज़रूरत|जरूरत|आवश्यकता)\\s+नहीं|दबाना\\s+नहीं|(?:की|के)\\s+(?:बजाय|बजाए|जगह|बदले))`,
);

const FLIP = /(पलट|उलट|साइड\s*बदल)/;
const ADD = /(डालिए|डालें|डाल\s*दीजिए|डाल\s*दें|डालकर)/;
const STIR = /(चलाइए|चला\s*लीजिए|चला\s*लें|चला\s*दीजिए|चलाएं|चलाएँ|चलाकर|मिलाइए|मिला\s*लीजिए|मिला\s*दीजिए|मिलाएं|मिलाएँ|मिलाकर|हिलाइए|मिक्स\s*(?:कीजिए|करें|करिए|करके|कर\s*लीजिए|कर\s*दीजिए))/;
/** "चलाइए" also means "run (the oven)": "100% पावर पर 3 मिनट चलाइए". */
const RUN = /(पावर|मिनट|सेकंड|माइक्रोवेव|ओवन|मोड)/;
const FOOD = /(चम्मच|खाना|खाने|दूध|दाल|सब्ज़ी|सब्जी|मिश्रण|घोल|मसाला|बाहर\s*से\s*अंदर)/;
const WAIT = /(रहने\s*दीजिए|रहने\s*दें|रहने\s*दे|रुकिए|रुकें|इंतज़ार|इंतजार|ढक\s*कर\s*रख|ढककर\s*रख)/;
/** "वज़न 500 ग्राम रहने दीजिए" keeps a setting; it is not a wait. */
const KEEPS_SETTING = /(वज़न|वजन|ग्राम|डिस्प्ले|पावर|तापमान)/;
// Putting something in or on: only the doing forms, so "रखने से पहले" (before putting) doesn't count.
const PUT = /(रखिए|रखें|रखकर|रख\s*दीजिए|रख\s*दें|फैलाकर|लगाइए|लगाकर)/;
const POUR = /(डालिए|डालें|डालकर|डाल\s*दीजिए|डाल\s*दें|भरिए|भरें)/;
const PLACE = new RegExp(`${PUT.source}|${POUR.source}`);
const NOT_PLACE = /(ध्यान\s*रख|खाली\s*रख|याद\s*रख|ढक\s*कर\s*रख|ढककर\s*रख|खुला\s*रख)/g;
const NEGATED = /(?:^|\s)(न|मत|नहीं)\s+(?:\S+\s+)?(रख|डाल|भर|लगा)/;
const ELSEWHERE = /(फ्रिज|फ्रीज़र|फ्रीजर|जार|डिब्बे|बाहर)/;
/** Signs that the food goes into the oven. A tawa or tray on its own is loaded on the counter. */
const INTO_OVEN = /(अंदर|ओवन\s*में|माइक्रोवेव\s*में|रैक\s*पर|ग्लास\s*ट्रे\s*पर|टर्नटेबल|रोटिसरी)/;
/** Kept out of the oven for now: set aside, or ready while it preheats empty ("Do not put anything in
 *  the oven during Pre-heat mode"). */
const NOT_YET = /(अलग\s*रख|एक\s*तरफ़?\s*रख|किनारे\s*रख|इस\s*बीच|गरम\s*होने\s*तक|जब\s*तक[^।]*गरम|प्रीहीट\s*(?:के\s*(?:समय|दौरान|बीच)|होने\s*तक)|बाहर\s*ही|अभी\s*(?:\S+\s*){0,3}?(?:न|नहीं|मत)(?=[\s।,]|$))/;
const ON_TAWA_OR_TRAY = /(तवे\s*पर|तवा\s*पर|ट्रे\s*पर)/;
const TAKEOUT = /(निकालिए|निकालें|निकाल\s*लीजिए|निकाल\s*लें|निकालकर)/;
/** Taken out of its packet or the fridge, or seeds out of a lemon: that happens outside the oven. */
const OUT_OF_ELSEWHERE = new RegExp(
  `(?:(?:पैकेट|पैकिंग|पाउच|थैली|डिब्बे|डिब्बा|जार|फ्रिज|फ्रीज़र|फ्रीजर)\\s*(?:में\\s*)?से|बीज|छिलका|छिलके|गुठली)\\s+(?:\\S+\\s+){0,2}?(?:${TAKEOUT.source})`,
  "g",
);
const outside = (s: string) => s.replace(OUT_OF_ELSEWHERE, (m) => " ".repeat(m.length));
const READY = /तैयार\s*(?:है|हैं|हो\s*(?:गया|गई|गए|जाएगा|जाएगी|जाएँगे|जाता|जाती))/;
const BEEP = /बीप\s*(?:की\s*आवाज़\s*)?(?:होने|हो\s*जाने|बजने|बजे|सुनाई|के\s*बाद|आने)/;
/** A value on the display going away: its own verb, right after it ("{Loc} हट जाएगा", "{Loc} दिखना
 *  बंद न हो जाए"), not "{Loc} दिखते ही उँगली हटा लीजिए" or "{End} आने पर … बंद हो जाएगा". */
const GOES = /^(?:(?:न|का|के|की|लिखा|हुआ|निशान|दिखना|आना|डिस्प्ले|से|अपने|आप)\s+){0,3}(?:हट|गायब|बंद\s*(?:न\s*)?हो|चला\s*जा|चली\s*जा|मिट)/;

// ---------------------------------------------------------------- what goes in, on what

const ACC = "(?:मल्टीकुक\\s*)?(?:तवा|तवे)|(?:हाई|लो)?\\s*रैक|एयर\\s*फ्राई\\s*(?:की\\s*)?ट्रे|रोटिसरी|स्टील|धातु|फॉइल|मेटल";
const ACCS = `(?:${ACC})(?:\\s*(?:,|और|या)\\s*(?:${ACC}))*`;
/** Accessories the step rules out or replaces ("तवे की जगह", "तवा कभी नहीं", "बिना रैक के"), and a rack the food is moved from. */
const RULED_OUT = new RegExp(
  `${ACCS}\\s*(?:की\\s*जगह|के\\s*बजाय|की\\s*बजाय|के\\s*स्थान\\s*पर)|बिना\\s+${ACCS}\\s*(?:के|की)|${ACCS}\\s*(?:(?:पर|में|का|की\\s*(?:ज़|ज़|ज)रूरत)\\s*)?(?:(?:कभी\\s*(?:भी\\s*)?|बिल्कुल\\s*))?(?:नहीं|मत)(?=[\\s।,!)]|$)|(?:हाई|लो)\\s*रैक\\s*से(?=\\s)`,
  "g",
);
const NEGATION = /(?:^|\s)(?:नहीं|मत|न|ना)(?:\s|$)/;

/** The part of a step about what goes in: without the accessories it rules out, and without the
 *  pieces that only say what not to use ("…बर्तन रखिए, स्टील, फॉइल, रैक या तवा कभी नहीं"). */
function whatGoesIn(text: string): string {
  const pieces = text.replace(RULED_OUT, " ").split(/[,;।]/);
  const kept: string[] = [];
  for (const piece of pieces) {
    if (!PLACE.test(piece) && NEGATION.test(piece)) {
      // also drop the short verbless list items just before it ("स्टील, फॉइल, …")
      while (kept.length && !PLACE.test(kept[kept.length - 1]) && kept[kept.length - 1].trim().split(/\s+/).length <= 3) kept.pop();
      continue;
    }
    kept.push(piece);
  }
  return kept.join(", ");
}

const METAL: Accessory[] = ["tawa", "tawa_high", "tawa_low", "tawa_rack", "low_rack", "high_rack", "rack", "air_fry_tray", "rotisserie"];

function accessoryIn(text: string): Accessory | null {
  if (/एयर\s*फ्राई\s*(?:की\s*|वाली\s*)?(?:ट्रे|पैन)|एयरफ्राई\s*(?:की\s*|वाली\s*)?(?:ट्रे|पैन)?/.test(text)) return "air_fry_tray";
  const high = /हाई\s*रैक/.test(text);
  const low = /लो\s*रैक/.test(text);
  // Both racks named: the one she puts it on ("लो रैक पर रखिए"), else just "a rack".
  const rack = high && low
    ? (/हाई\s*रैक\s*पर\s*(?:ही\s*)?(?:रखिए|रखें|रखकर|रख\s*दीजिए|रख\s*दें)/.test(text) ? "high" : /लो\s*रैक\s*पर\s*(?:ही\s*)?(?:रखिए|रखें|रखकर|रख\s*दीजिए|रख\s*दें)/.test(text) ? "low" : "either")
    : high ? "high" : low ? "low" : /रैक/.test(text) ? "either" : null;
  if (/(तवा|तवे)/.test(text)) {
    if (/(हाई|लो)\s*(?:या|और)\s*(हाई|लो)/.test(text)) return "tawa_rack"; // "हाई या लो रैक": whichever the recipe says
    return rack === "high" ? "tawa_high" : rack === "low" ? "tawa_low" : rack ? "tawa_rack" : "tawa";
  }
  if (rack) return rack === "high" ? "high_rack" : rack === "low" ? "low_rack" : "rack";
  if (/रोटिसरी|सीख(?!\s*कबाब)/.test(text)) return "rotisserie";
  if (/पॉपकॉर्न/.test(text)) return "popcorn";
  // A vessel: the one named last ("दूध की थैली काटकर दूध बाउल में डालिए" goes in the bowl).
  const vessels = [...text.matchAll(/(प्लेट|थाली)|(बाउल|कटोर|बर्तन)/g)];
  if (vessels.length) return vessels[vessels.length - 1][1] ? "plate" : "bowl";
  if (/(ग्लास\s*ट्रे|टर्नटेबल)/.test(text)) return "glass_tray";
  return null;
}

/** What she puts in, from the words that are about putting it in. In microwave mode no metal goes in. */
export function accessoryOf(text: string): Accessory | null {
  const t = whatGoesIn(text);
  const found = accessoryIn(t);
  if (found && METAL.includes(found)) {
    const putClause = t.split(/[,;।]/).find((p) => PLACE.test(p) && accessoryIn(p) === found) ?? t;
    if (/माइक्रोवेव\s*मोड/.test(putClause)) return null;
  }
  return found;
}

function stirs(text: string): boolean {
  const m = text.match(STIR);
  if (!m) return false;
  return !(/चला/.test(m[0]) && RUN.test(text) && !FOOD.test(text));
}

/** Something goes into the oven: a put or pour verb with a sign of the oven ("अंदर", "रैक पर"), or a
 *  put verb with a microwave-safe dish. Pouring milk into a bowl happens outside, and so does loading
 *  the tawa or the tray, or anything set aside while the oven preheats. */
function places(text: string): boolean {
  const t = whatGoesIn(outside(text)).replace(NOT_PLACE, " ");
  if (!PLACE.test(t) || NEGATED.test(t) || ELSEWHERE.test(t) || NOT_YET.test(t)) return false;
  const a = accessoryOf(t);
  if (a === null && /माइक्रोवेव\s*मोड/.test(t) && !/(बाउल|कटोर|बर्तन|प्लेट|थाली)/.test(t)) return false;
  if (INTO_OVEN.test(t)) return true;
  if (!PUT.test(t)) return false;
  return /माइक्रोवेव-सेफ/.test(t) || (a !== null && ["rack", "low_rack", "high_rack", "rotisserie", "popcorn", "glass_tray"].includes(a));
}

/** Food spread on the tawa or the air-fry tray, with nothing saying it goes inside yet. */
function arranges(text: string): "tawa" | "air_fry_tray" | null {
  const t = outside(text);
  if (!PUT.test(t) || NEGATED.test(t) || !ON_TAWA_OR_TRAY.test(t)) return null;
  return /ट्रे\s*पर/.test(t) && !/(तवा|तवे)\s*पर/.test(t) ? "air_fry_tray" : "tawa";
}

function pours(text: string): boolean {
  const t = outside(text);
  return POUR.test(t) && !NEGATED.test(t) && !ELSEWHERE.test(t) && /(बाउल|कटोर|बर्तन|प्लेट|थाली)/.test(t);
}

const takesOut = (text: string) => TAKEOUT.test(outside(text)) && !NEGATED.test(text);
const minutesIn = (text: string) => text.match(/(\d+)\s*मिनट/)?.[1];
const waits = (text: string) => WAIT.test(text) && !KEEPS_SETTING.test(text);

function dialPurpose(clause: string, values: string[]): DialFor {
  // What the display shows says it best: 1-9 is a code, 180°C a temperature, 0.4 a weight, 3:00 a time.
  for (const v of values) {
    if (/°|℃/.test(v)) return "temperature";
    if (/^\d+-\d+$|^(GC|CC)-?\d$/i.test(v)) return "code";
    if (/^\d?\.\d+$/.test(v)) return "weight";
    if (/^\d+:\d\d$/.test(v)) return "time";
  }
  if (/(वज़न|वजन|ग्राम|किलो)/.test(clause)) return "weight";
  if (/(तापमान|डिग्री)/.test(clause)) return "temperature";
  if (/(पावर|वॉट|%)/.test(clause)) return "power";
  if (/(समय|मिनट|सेकंड)/.test(clause)) return "time";
  if (/(कोड|मेनू|मेन्यू)/.test(clause)) return "code";
  return null;
}

/** Seconds of a hold, if the step says (2 to 10; anything else is not a hold time). */
function holdSeconds(...texts: string[]): number | undefined {
  for (const t of texts) {
    const m = t.match(SECONDS);
    const n = m ? countOf(m[1]) : NaN;
    if (n >= 2 && n <= 10) return n;
  }
  return undefined;
}

function pressOf(id: ButtonId, clause: string, shown: string[], step: string): Action {
  if (id === "DIAL") return { kind: "press", id, how: "turn", dialFor: dialPurpose(clause, shown) };
  const hold = (): Action => ({ kind: "press", id, how: "hold", seconds: holdSeconds(clause, step) });
  if (HOLD.test(clause)) return hold();
  // On this oven, "STOP until Loc goes" can only be the 3-second hold of the child lock, and
  // Cook Mode for Wi-Fi is held too.
  if (id === "STOP" && UNTIL.test(clause) && shown.some((v) => /^loc$/i.test(v))) return hold();
  if (id === "COOK_MODE" && /(वाई-?फ़?ाई|wi-?fi)/i.test(step)) return hold();
  const times = clause.match(TIMES);
  if (times) {
    if (times[2]) return { kind: "press", id, how: "repeat" }; // "छह से आठ बार": a range
    const n = countOf(times[1]);
    return n > 1 ? { kind: "press", id, how: "repeat", times: n } : { kind: "press", id, how: "tap" };
  }
  if (AGAIN.test(clause) || (UNTIL.test(clause) && PRESSES_ON.test(clause))) return { kind: "press", id, how: "repeat" };
  return { kind: "press", id, how: "tap" };
}

/** A clause without buttons can still be one of the things to do between presses. */
function chore(clause: string): Action | null {
  if (FLIP.test(clause)) return { kind: "flip" };
  if (stirs(clause)) return { kind: "stir" };
  if (takesOut(clause)) return { kind: "takeout" };
  if (places(clause)) return { kind: "place", accessory: accessoryOf(clause) };
  if (waits(clause)) return { kind: "wait", minutes: minutesIn(clause) };
  return null;
}

function beepAction(text: string): BeepAction {
  if (FLIP.test(text)) return "flip";
  if (ADD.test(text)) return "add";
  if (stirs(text)) return "stir";
  if (places(text)) return "place";
  if (takesOut(text)) return "takeout";
  if (waits(text)) return "wait";
  return "open";
}

export function describeStep(markup: string): StepScene | null {
  // The step as one line, with placeholders where the buttons and display values are.
  const shownTexts: string[] = [];
  let flat = parseMarkup(markup)
    .map((p) => {
      if (p.kind === "button") return ` ⟦b:${p.id}⟧ `;
      if (p.kind === "display") return ` ⟦d:${shownTexts.push(p.text) - 1}⟧ `;
      return p.text;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const words = (s: string) => s.replace(TOKEN, " ").replace(/\s+/g, " ").trim();
  // A button the step says not to press is not drawn at all.
  flat = flat.replace(/⟦b:([^⟧]+)⟧/g, (m, id: string, at: number) => {
    const after = words(flat.slice(at + m.length).split(/⟦[bd]:/)[0]);
    const before = words(flat.slice(0, at).split(/⟧/).pop() ?? "");
    return FORBIDDEN_AFTER.test(after) || /(?:^|\s)बिना$/.test(before) ? ` ⟦x:${id}⟧ ` : m;
  });
  const tokensIn = (s: string) => [...s.matchAll(TOKEN)].map((m) => ({ type: m[1], value: m[2], at: m.index }));

  // Clauses, with the "जब तक …" half of "तब तक …, जब तक …" and a following "…तक दबाए रखिए" kept
  // with the press they belong to.
  const clauses: string[] = [];
  for (const c of flat.split(BOUNDARY).filter((c) => c.trim())) {
    const prev = clauses[clauses.length - 1];
    const glue = prev !== undefined && prev.includes("⟦b:") && !c.includes("⟦b:")
      && ((/^\s*जब\s*तक/.test(c) && /(?:तब|देर)\s*तक/.test(prev)) || HOLD.test(words(c)));
    if (glue) clauses[clauses.length - 1] = `${prev}, ${c}`;
    else clauses.push(c);
  }

  // What the display shows, in order, and whether each value appears or goes away.
  const values: Shown[] = [];
  const firstAt = new Map<string, number>();
  for (const t of tokensIn(flat)) {
    if (t.type !== "d") continue;
    const text = shownTexts[Number(t.value)];
    const after = words(flat.slice(t.at + `⟦d:${t.value}⟧`.length).split(/[।,;]|⟦/)[0]);
    const goes = GOES.test(after);
    const seen = values.find((v) => v.text === text);
    if (seen) seen.goes ||= goes;
    else {
      values.push({ text, goes });
      firstAt.set(text, t.at);
    }
  }
  const kept = values.slice(0, 3);
  // Each gap decides its own joiner; a bare comma ("{GC-1}, {GC-2} या {GC-3}") joins like the next gap.
  const joins: ("or" | "then" | undefined)[] = kept.slice(1).map((v, i) => {
    const gap = flat.slice(firstAt.get(kept[i].text)!, firstAt.get(v.text)!).replace(/^⟦d:[^⟧]+⟧/, "");
    if (/⟦b:/.test(gap) || /(^|\s)(फिर|बाद|तब)(\s|$)/.test(words(gap))) return "then";
    if (/(^|\s)(या|अथवा)(\s|$)/.test(words(gap))) return "or";
    return undefined;
  });
  for (let i = joins.length - 1; i >= 0; i--) joins[i] ??= joins[i + 1] ?? "then";
  const readout: Readout | undefined = kept.length ? { values: kept, joins: joins as ("or" | "then")[] } : undefined;
  const allWords = words(flat);
  const buttonsAfter = (from: number) => [...new Set(tokensIn(flat.slice(from)).flatMap((t) => (t.type === "b" ? [t.value as ButtonId] : [])))];

  // At the beep: only when the step starts with it ("बीप होने पर …"), not "[START] दबाइए। बीप होने तक रुकिए।"
  const beep = flat.match(BEEP);
  if (beep?.index !== undefined && !tokensIn(flat.slice(0, beep.index)).some((t) => t.type === "b")) {
    const rest = flat.slice(beep.index + beep[0].length);
    const restWords = words(rest.split(/⟦b:/)[0]);
    const action = beepAction(restWords);
    return {
      kind: "beep",
      action,
      accessory: action === "place" ? accessoryOf(restWords) : undefined,
      minutes: action === "wait" ? minutesIn(restWords) : undefined,
      then: buttonsAfter(beep.index),
    };
  }

  // Buttons: every press in order (the same button can come twice), with the chores in between.
  const actions: Action[] = [];
  for (const clause of clauses) {
    const tokens = tokensIn(clause);
    const text = words(clause);
    const shown = tokens.flatMap((t) => (t.type === "d" ? [shownTexts[Number(t.value)]] : []));
    const presses = tokens.flatMap((t) => (t.type === "b" ? [pressOf(t.value as ButtonId, text, shown, allWords)] : []));
    if (!presses.length) {
      const job = chore(text);
      if (job) actions.push(job);
      continue;
    }
    // A press and a flip or stir in one breath: "[STOP] दबाकर खाना पलटिए".
    const verb = clause.match(FLIP) ?? (stirs(text) ? clause.match(STIR) : null);
    if (!verb) actions.push(...presses);
    else if ((verb.index ?? 0) > clause.indexOf("⟦b:")) actions.push(...presses, FLIP.test(verb[0]) ? { kind: "flip" } : { kind: "stir" });
    else actions.push(FLIP.test(verb[0]) ? { kind: "flip" } : { kind: "stir" }, ...presses);
  }
  if (actions.some((a) => a.kind === "press")) return { kind: "panel", actions, readout };

  // Everything else is one picture: of the things the step asks for, the one it says first
  // ("अंदर ही रहने दीजिए, फिर निकालिए" is about the standing time).
  const t = allWords;
  const candidates: [number, () => StepScene][] = [];
  const add = (ok: boolean, re: RegExp, scene: () => StepScene, where = t) => {
    if (ok) candidates.push([where.search(re), scene]);
  };
  add(takesOut(t), TAKEOUT, () => ({ kind: "takeout", gloves: /(दस्ताने|ग्लव्स)/.test(t) }), outside(t));
  const placesIn = places(t);
  add(placesIn, PLACE, () => ({ kind: "place", accessory: accessoryOf(outside(t).replace(NOT_PLACE, " ")) }), outside(t));
  const tray = placesIn ? null : arranges(t);
  add(tray !== null, PUT, () => ({ kind: "arrange", accessory: tray! }), outside(t));
  add(!placesIn && !tray && pours(t), POUR, () => ({ kind: "pour", accessory: accessoryOf(outside(t)) }), outside(t));
  add(FLIP.test(t), FLIP, () => ({ kind: "flip" }));
  add(stirs(t), STIR, () => ({ kind: "stir", outsideIn: /बाहर\s*से\s*अंदर/.test(t) }));
  add(waits(t), WAIT, () => ({ kind: "wait", minutes: minutesIn(t) }));
  if (candidates.length) return candidates.sort((a, b) => a[0] - b[0])[0][1]();
  if (READY.test(t)) return { kind: "ready" };
  if (readout) return { kind: "display", readout };
  return null;
}
