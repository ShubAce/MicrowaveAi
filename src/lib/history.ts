import type { Answer, HistoryTurn } from "./protocol";

/** How an answer is remembered in the conversation sent back with the next question. */
export function answerToHistory(a: Answer): HistoryTurn {
  const text = [a.title, a.intro, ...a.steps.map((s, i) => `${i + 1}. ${s}`), a.warning, a.closing]
    .filter(Boolean)
    .join("\n");
  return { role: "model", text, menu: a.menu };
}
