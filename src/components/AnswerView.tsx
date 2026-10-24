"use client";

import { motion } from "motion/react";
import { useEffect } from "react";
import { accessoryName } from "@/lib/markup";
import type { Answer, Segment } from "@/lib/protocol";
import { PanelDiagram, StepText } from "./PanelBits";

export interface AnswerState {
  question: string | null;
  title: string | null;
  segments: Segment[];
  answer: Answer | null;
  /** Index of the piece being spoken right now. */
  active: number | null;
  error: string | null;
}

export const EMPTY_ANSWER: AnswerState = { question: null, title: null, segments: [], answer: null, active: null, error: null };

function SpeakingBars() {
  return (
    <span aria-hidden className="speaking-bars ml-auto flex h-5 items-end gap-[3px] pl-2">
      {[0, 1, 2].map((i) => <span key={i} className="block h-full w-[4px] rounded-full bg-rani" />)}
    </span>
  );
}

export function AnswerView({ state, onReplay, onSuggestion }: {
  state: AnswerState;
  onReplay: (index: number) => void;
  onSuggestion: (text: string) => void;
}) {
  const { question, title, segments, answer, active, error } = state;
  const intro = segments.find((s) => s.role === "intro");
  const steps = segments.filter((s) => s.role === "step");
  const warning = segments.find((s) => s.role === "warning");
  const closing = segments.find((s) => s.role === "closing");
  const waiting = !answer && !error;

  // Keep the piece being spoken on screen.
  useEffect(() => {
    if (active === null) return;
    document.querySelector(`[data-seg="${active}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      {question && (
        <div className="ml-auto max-w-[88%] rounded-[22px] rounded-br-md bg-rani-soft px-4 py-3">
          <p className="text-[16px] font-semibold text-rani-deep">आपने पूछा</p>
          <p className="text-[21px] leading-snug">{question}</p>
        </div>
      )}

      {title && <h1 className="text-[30px] font-extrabold leading-[1.15]">{title}</h1>}

      {intro && (
        <p
          data-seg={intro.index}
          onClick={() => onReplay(intro.index)}
          className={`rounded-2xl text-[22px] leading-[1.55] ${active === intro.index ? "bg-genda-soft px-3 py-2" : ""}`}
        >
          <StepText markup={intro.markup} />
        </p>
      )}

      {steps.length > 0 && (
        <ol className="flex flex-col gap-3">
          {steps.map((s) => {
            const on = active === s.index;
            return (
              <motion.li
                key={s.index}
                data-seg={s.index}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                onClick={() => onReplay(s.index)}
                className={`flex cursor-pointer gap-3 rounded-[20px] border-2 px-3 py-3 transition-colors ${on ? "border-genda bg-genda-soft" : "border-pista-line bg-white"}`}
              >
                <span className={`grid size-10 shrink-0 place-items-center rounded-full text-[21px] font-extrabold ${on ? "bg-genda text-baingan" : "bg-pista-deep text-baingan"}`}>
                  {s.step}
                </span>
                <span className="flex-1 pt-0.5 text-[23px] font-medium leading-normal">
                  <StepText markup={s.markup} />
                </span>
                {on && <SpeakingBars />}
              </motion.li>
            );
          })}
        </ol>
      )}

      {waiting && (
        <div aria-live="polite" className="flex items-center gap-3 rounded-[20px] border-2 border-dashed border-pista-line px-4 py-4 text-[20px] text-baingan-soft">
          <span className="flex gap-1.5" aria-hidden>
            {[0, 1, 2].map((i) => <span key={i} className="block size-2.5 rounded-full bg-baingan-soft" style={{ animation: `dots 1.2s ${i * 0.2}s infinite` }} />)}
          </span>
          {segments.length ? "आगे बता रही हूँ…" : "जवाब ढूँढ रही हूँ…"}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-[20px] border-2 border-rani bg-white px-4 py-4 text-[21px] leading-snug">
          {error}
        </div>
      )}

      {warning && (
        <div
          data-seg={warning.index}
          onClick={() => onReplay(warning.index)}
          className={`flex gap-3 rounded-[20px] border-2 border-genda px-4 py-3 ${active === warning.index ? "bg-genda-soft" : "bg-[#fff8e6]"}`}
        >
          <span aria-hidden className="text-[26px] leading-none">⚠️</span>
          <p className="text-[21px] leading-normal">
            <span className="font-bold">ध्यान दें: </span>
            <StepText markup={warning.markup} />
          </p>
        </div>
      )}

      {closing && (
        <p
          data-seg={closing.index}
          onClick={() => onReplay(closing.index)}
          className={`rounded-2xl text-[21px] leading-[1.55] text-baingan ${active === closing.index ? "bg-genda-soft px-3 py-2" : ""}`}
        >
          <StepText markup={closing.markup} />
        </p>
      )}

      {answer?.accessories && answer.accessories.length > 0 && (
        <div>
          <p className="mb-2 text-[18px] font-bold text-baingan-soft">अंदर क्या रखें</p>
          <div className="flex flex-wrap gap-2">
            {answer.accessories.map((a) => (
              <span key={a} className="rounded-full bg-white px-3.5 py-1.5 text-[19px] font-semibold shadow-[0_0_0_2px_var(--color-pista-line)]">
                {accessoryName(a)}
              </span>
            ))}
          </div>
        </div>
      )}

      {answer && answer.steps.length > 0 && (
        <div className="rounded-[26px] bg-white px-4 pb-5 pt-4 shadow-[0_0_0_2px_var(--color-pista-line)]">
          <p className="mb-3 text-center text-[19px] font-bold">पैनल पर ये बटन, इसी क्रम में</p>
          <PanelDiagram steps={answer.steps} display={answer.menu?.code} />
        </div>
      )}

      {answer?.suggestions && answer.suggestions.length > 0 && (
        <div>
          <p className="mb-2 text-[18px] font-bold text-baingan-soft">आगे पूछ सकती हैं</p>
          <div className="flex flex-col gap-2">
            {answer.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestion(s)}
                className="rounded-[18px] bg-white px-4 py-3 text-left text-[20px] font-semibold shadow-[0_0_0_2px_var(--color-pista-line)] active:bg-genda-soft"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {answer?.pages && answer.pages.length > 0 && (
        <p className="text-[16px] text-baingan-soft">LG मैनुअल के पेज {answer.pages.join(", ")} से</p>
      )}
    </div>
  );
}
