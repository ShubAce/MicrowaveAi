// Turns a question into a streamed, spoken answer:
// retrieve recipes → stream Gemini JSON → emit each finished piece → speak it (Sarvam, or Gemini if Sarvam fails).

import { Allow, parse } from "partial-json";
import { isButtonId } from "../buttons";
import { spokenPiece } from "../markup";
import type { Answer, AskEvent, AskSettings, HistoryTurn, Segment, SegmentRole } from "../protocol";
import { streamWithFallback, type GeminiBody } from "./gemini";
import { ANSWER_SCHEMA, FIELD_ORDER, SYSTEM_INSTRUCTION } from "./prompt";
import { findRecipes } from "./retrieve";
import { say as speakPiece } from "./voice";

const MAX_HISTORY = 6;

function contentsFor(question: string, history: HistoryTurn[], recipeDetails: string) {
  const turns = history.slice(-MAX_HISTORY).map((t) => ({
    role: t.role,
    parts: [{ text: t.text.slice(0, 1200) }],
  }));
  const text = recipeDetails
    ? `${question}\n\n[Recipe details from the manual that may be relevant]\n${recipeDetails}`
    : question;
  return [...turns, { role: "user" as const, parts: [{ text }] }];
}

function normalise(raw: Record<string, unknown>): Answer {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  const menu = raw.menu as { button?: string; code?: string } | undefined;
  return {
    kind: (str(raw.kind) || "info") as Answer["kind"],
    title: str(raw.title),
    intro: str(raw.intro),
    steps: list(raw.steps),
    warning: str(raw.warning) || undefined,
    closing: str(raw.closing) || undefined,
    suggestions: list(raw.suggestions).slice(0, 3),
    menu: menu?.button && isButtonId(menu.button) && menu.code ? { button: menu.button, code: menu.code } : undefined,
    accessories: list(raw.accessories),
    pages: Array.isArray(raw.pages) ? raw.pages.filter((p): p is number => Number.isInteger(p)) : [],
  };
}

export async function answerQuestion({ question, history, settings, emit, signal, withAudio = true }: {
  question: string;
  history: HistoryTurn[];
  settings: AskSettings;
  emit: (e: AskEvent) => void;
  signal?: AbortSignal;
  /** Tests can skip speech. */
  withAudio?: boolean;
}): Promise<void> {
  const started = Date.now();
  const recipes = findRecipes(question, history);
  const body: GeminiBody = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: contentsFor(question, history, recipes.map((r) => r.md).join("\n\n")),
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: ANSWER_SCHEMA,
      temperature: 0.4,
      maxOutputTokens: 1200,
    },
  };

  // --- segments: emit each piece of the answer as soon as the stream has moved past it
  let index = 0;
  let metaSent = false;
  let stepsSent = 0;
  const sent = new Set<SegmentRole>();
  const speaking: Promise<void>[] = [];
  const voices = new Set<string>();

  let kind: Answer["kind"] | undefined;
  const say = (role: SegmentRole, markup: string, step?: number, isLast = false) => {
    if (!markup.trim()) return;
    const segment: Segment = { index: index++, role, markup, ...(step ? { step } : {}) };
    emit({ type: "segment", segment });
    if (!withAudio) return;
    speaking.push(
      speakPiece(spokenPiece(role, markup, { kind, step, isLast }), settings.voice, settings.pace, signal)
        .then(({ b64, mime, by }) => {
          voices.add(by);
          emit({ type: "audio", index: segment.index, mime, b64 });
        })
        .catch((e: Error) => {
          console.error(`text-to-speech failed for piece ${segment.index}: ${e.message}`);
          emit({ type: "audio_error", index: segment.index });
        }),
    );
  };

  const progress = (full: string, final: boolean) => {
    let obj: Record<string, unknown>;
    try {
      obj = parse(full, Allow.ALL) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!obj || typeof obj !== "object") return;
    const passed = (field: (typeof FIELD_ORDER)[number]) =>
      final || FIELD_ORDER.slice(FIELD_ORDER.indexOf(field) + 1).some((f) => f in obj);
    if (typeof obj.kind === "string" && passed("kind")) kind = obj.kind as Answer["kind"];

    if (!metaSent && typeof obj.title === "string" && passed("title")) {
      metaSent = true;
      emit({ type: "meta", title: obj.title, kind: (obj.kind as Answer["kind"]) ?? "info" });
    }
    if (!sent.has("intro") && typeof obj.intro === "string" && passed("intro")) {
      sent.add("intro");
      say("intro", obj.intro);
    }
    if (sent.has("intro") && Array.isArray(obj.steps)) {
      const allIn = passed("steps"); // only then is the last step known to be the last
      const done = allIn ? obj.steps.length : obj.steps.length - 1;
      while (stepsSent < done) {
        const step = obj.steps[stepsSent];
        stepsSent++;
        if (typeof step === "string") say("step", step, stepsSent, allIn && stepsSent === obj.steps.length);
      }
    }
    // Both come after "steps" in the schema, so all steps have been said by the time they are complete.
    for (const role of ["warning", "closing"] as const) {
      const text = obj[role];
      if (!sent.has(role) && typeof text === "string" && passed(role)) {
        sent.add(role);
        say(role, text);
      }
    }
  };

  let firstWords = 0;
  const result = await streamWithFallback(body, (full) => {
    firstWords ||= Date.now() - started;
    progress(full, false);
  }, { signal });
  progress(result.text, true);

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(result.text);
  } catch {
    raw = parse(result.text, Allow.ALL) as Record<string, unknown>;
  }
  const answer = normalise(raw);
  await Promise.all(speaking);
  const ms = Date.now() - started;
  // One line per question in the server log (Vercel → Logs), to spot slow models or missed recipes.
  console.log(`answer ${JSON.stringify({ model: result.model, voice: [...voices].join("+"), firstWordsMs: firstWords, totalMs: ms, pieces: index,
    kind: answer.kind, menu: answer.menu ? `${answer.menu.button} ${answer.menu.code}` : null,
    attached: recipes.map((r) => `${r.category} ${r.code}`) })}`);
  emit({ type: "done", answer, model: result.model, ms });
}
