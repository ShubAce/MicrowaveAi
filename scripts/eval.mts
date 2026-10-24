// Runs real questions through the answer pipeline (text in, no audio) and checks the answers.
// Usage: npx tsx --env-file=.env scripts/eval.mts ["word|other word" to pick questions, or "follow"]
// Each question is one Gemini request; the free tier allows ~20 a day per model.
import { readFileSync } from "node:fs";
import { answerToHistory } from "../src/lib/history";
import { toPlain } from "../src/lib/markup";
import type { Answer, AskEvent } from "../src/lib/protocol";
import { answerQuestion } from "../src/lib/server/answer";
import { findRecipes } from "../src/lib/server/retrieve";

interface Case { q: string; menu?: string; kind?: string; has?: string[]; }
const cases: Case[] = JSON.parse(readFileSync("tests/questions.json", "utf8"));
const filter = process.argv[2];
const settings = { voice: "sarika_hi_conversation", pace: 0.95 };

async function ask(q: string, history: ReturnType<typeof answerToHistory>[] = []) {
  let answer: Answer | undefined;
  let model = "";
  let ms = 0;
  let firstSegmentMs = 0;
  const t0 = Date.now();
  await answerQuestion({
    question: q, history, settings, withAudio: false,
    emit: (e: AskEvent) => {
      if (e.type === "segment" && !firstSegmentMs) firstSegmentMs = Date.now() - t0;
      if (e.type === "done") ({ answer, model, ms } = e);
    },
  });
  return { answer: answer!, model, ms, firstSegmentMs };
}

let pass = 0;
const run = cases.filter((c) => !filter || filter.split("|").some((f) => c.q.includes(f)));
for (const c of run) {
  const picked = findRecipes(c.q, []).map((r) => `${r.code} ${r.name}`);
  try {
    const { answer, model, ms, firstSegmentMs } = await ask(c.q);
    const all = [answer.title, answer.intro, ...answer.steps, answer.warning, answer.closing].join("\n");
    const menu = answer.menu ? `${answer.menu.button} ${answer.menu.code}` : "-";
    const problems: string[] = [];
    if (c.menu && !new RegExp(`^(${c.menu})$`).test(menu)) problems.push(`menu ${menu} ≠ ${c.menu}`);
    if (c.kind && !new RegExp(`^(${c.kind})$`).test(answer.kind)) problems.push(`kind ${answer.kind} ≠ ${c.kind}`);
    for (const h of c.has ?? []) if (!new RegExp(h).test(all)) problems.push(`missing /${h}/`);
    if (!problems.length) pass++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.q}   [${model} ${ms} ms, first ${firstSegmentMs} ms, retrieved: ${picked.join("; ") || "-"}]`);
    console.log(`     ${answer.kind} | ${menu} | ${toPlain(all).replace(/\n/g, " ⏎ ")}`);
    if (problems.length) console.log(`     → ${problems.join("; ")}`);
  } catch (e) {
    console.log(`ERR  ${c.q}: ${(e as Error).message}`);
  }
}
console.log(`\n${pass}/${run.length} passed`);

if (!filter || filter === "follow") {
  // A follow-up that relies on the conversation history.
  try {
    const first = await ask("फ्रिज से निकला चिकन कैसे पिघलाऊँ?");
    const follow = await ask("वज़न कितना चुनूँ?", [{ role: "user", text: "फ्रिज से निकला चिकन कैसे पिघलाऊँ?" }, answerToHistory(first.answer)]);
    const text = [follow.answer.intro, ...follow.answer.steps].join(" ");
    console.log(`follow-up: ${/0\.5|1\.0|आधा|एक किलो|500|1 किलो/.test(text) ? "ok" : "FAIL"} → ${toPlain(text)}`);
  } catch (e) {
    console.log(`ERR  follow-up: ${(e as Error).message}`);
  }
}
