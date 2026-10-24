// Find the auto-cook recipes a spoken question is about, so their full write-ups can be attached.
// The catalog of all 331 menus is always in the prompt; this only adds detail (ingredients, beep steps).

import type { HistoryTurn } from "../protocol";
import { RECIPES, findMenu, type Recipe } from "./kb";

/** Spelling-tolerant key: speech recognition and people write Hindi words in several ways. */
export function phoneticKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[़ँं]/g, "") // nukta, chandrabindu, anusvara
    .normalize("NFC")
    .replace(/ॉ/g, "ो") // ॉ → ो
    .replace(/ऑ/g, "ओ") // ऑ → ओ
    .replace(/ी/g, "ि") // ी → ि
    .replace(/ई/g, "इ") // ई → इ
    .replace(/ू/g, "ु") // ू → ु
    .replace(/ऊ/g, "उ") // ऊ → उ
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  ["की", "का", "के", "को", "में", "से", "और", "है", "हैं", "कैसे", "क्या", "जी", "एक", "ये", "यह", "वो", "वह",
   "मुझे", "मैं", "हम", "कितना", "कितनी", "कितने", "बनाना", "बनाए", "बनाऊ", "बनाते", "करना", "करे", "करु",
   "वाला", "वाली", "वाले", "the", "and", "of", "with", "in",
   // names of modes and the oven itself, not dishes
   "एयर", "फ्राई", "माइक्रोवेव", "ओवन", "बटन", "मोड", "मेनू", "मेन्यू", "सखी"].map(phoneticKey),
);

const tokens = (key: string) => key.split(" ").filter((t) => t.length >= 2 && !STOPWORDS.has(t));

/** Drop a final vowel sign, so plural/oblique endings compare equal (समोसा / समोसे, पराठा / पराठे). */
const stem = (w: string) => w.replace(/[ा-ौॢॣ]+$/, "");

/** Same word, allowing different endings: vowel-sign endings (समोसा / समोसे) and verb forms
 *  (पिघलाना / पिघलाऊँ). Lengths count code units: "पिघला" is 5, so near-misses like स्टील / स्टीम
 *  (common prefix 4) don't match. */
function sameWord(a: string, b: string): boolean {
  if (a === b || stem(a) === stem(b)) return true;
  const min = Math.min(a.length, b.length);
  let p = 0;
  while (p < min && a[p] === b[p]) p++;
  return p >= 5 && p >= min - 2;
}

interface Indexed {
  recipe: Recipe;
  keys: { key: string; words: string[] }[];
}

const INDEX: Indexed[] = RECIPES.map((recipe) => ({
  recipe,
  keys: [recipe.hi, ...recipe.aka, recipe.name].map((k) => {
    const key = phoneticKey(k);
    return { key, words: tokens(key) };
  }),
}));

/** Exact name in the question beats all its words matching, which beats some words matching. */
function score(entry: Indexed, qKey: string, qWords: string[]): number {
  let best = 0;
  for (const { key, words } of entry.keys) {
    if (!words.length) continue;
    if (` ${qKey} `.includes(` ${key} `)) {
      best = Math.max(best, 100 + key.length);
      continue;
    }
    const matched = words.filter((w) => qWords.some((q) => sameWord(q, w)));
    if (matched.length === words.length) best = Math.max(best, 50 + key.length);
    else if (matched.length) best = Math.max(best, matched.reduce((n, w) => n + w.length, 0));
  }
  return best;
}

export function findRecipes(question: string, history: HistoryTurn[], limit = 3): Recipe[] {
  const qKey = phoneticKey(question);
  const qWords = tokens(qKey);
  const ranked = INDEX.map((e) => ({ r: e.recipe, s: score(e, qKey, qWords) }))
    .filter((x) => x.s >= 6)
    .sort((a, b) => b.s - a.s);
  const top = ranked.length ? ranked[0].s : 0;
  const picked = ranked.filter((x) => x.s >= Math.max(6, top * 0.6)).slice(0, limit).map((x) => x.r);

  // Follow-ups ("और फिर?", "कितना वज़न?") are about the menu from the previous answer.
  const lastMenu = [...history].reverse().find((t) => t.role === "model" && t.menu)?.menu;
  if (lastMenu) {
    const prev = findMenu(lastMenu.button, lastMenu.code);
    if (prev && !picked.includes(prev)) picked.push(prev);
  }
  return picked.slice(0, limit + 1);
}
