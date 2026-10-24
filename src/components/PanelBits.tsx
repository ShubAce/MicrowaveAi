"use client";

import { Fragment } from "react";
import { BUTTONS, type ButtonId } from "@/lib/buttons";
import { parseMarkup } from "@/lib/markup";

/** A panel button, drawn the way it looks on the microwave's black glass. */
export function ButtonChip({ id }: { id: ButtonId }) {
  const b = BUTTONS[id];
  if (id === "DIAL") {
    return (
      <span className="mx-0.5 inline-flex items-center gap-1.5 rounded-full bg-glass py-[0.08em] pl-[0.25em] pr-[0.6em] align-[0.06em] text-[0.8em] font-semibold leading-[1.4] text-white">
        <span aria-hidden className="inline-block size-[1.05em] rounded-full border-[0.16em] border-gold bg-glass-2" />
        {b.label}
      </span>
    );
  }
  return (
    <span
      title={b.hint}
      className="mx-0.5 inline-flex items-center gap-1 rounded-[0.5em] bg-glass px-[0.5em] py-[0.08em] align-[0.06em] text-[0.8em] font-semibold leading-[1.4] text-white"
    >
      {id === "START" && <span aria-hidden className="text-[0.85em]">◇</span>}
      <span className={id === "STOP" ? "text-[#ff6b6b] underline decoration-[#e5484d] decoration-2 underline-offset-[0.25em]" : undefined}>
        {b.label}
      </span>
    </span>
  );
}

/** What the microwave's display shows, in its own seven-segment style. */
export function LedBadge({ text }: { text: string }) {
  const m = text.match(/^(.*?)\s*(°C|℃|°)$/);
  const digits = m ? m[1] : text;
  return (
    <span className="mx-0.5 inline-flex items-baseline gap-0.5 rounded-[0.35em] bg-[#0e0c12] px-[0.45em] py-[0.12em] align-[0.04em] shadow-[inset_0_0_0_2px_#2a2733]">
      <span className="led-glow font-led text-[0.7em] tracking-wider text-led">{digits}</span>
      {m && <span className="led-glow text-[0.72em] text-led">°C</span>}
    </span>
  );
}

export function StepText({ markup }: { markup: string }) {
  return (
    <>
      {parseMarkup(markup).map((p, i) =>
        p.kind === "button" ? <ButtonChip key={i} id={p.id} />
        : p.kind === "display" ? <LedBadge key={i} text={p.text} />
        : <Fragment key={i}>{p.text}</Fragment>,
      )}
    </>
  );
}
