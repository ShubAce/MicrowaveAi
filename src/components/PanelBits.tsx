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

// Layout of the real panel (photo of MJEN286UGWF): display, two rows of three, dial, STOP and START.
const SPOTS: Record<ButtonId, { x: number; y: number; w: number; h: number; lines: string[] }> = {
  COOK_MODE: { x: 40, y: 116, w: 58, h: 50, lines: ["Cook", "Mode", "*Wi-Fi"] },
  CHARCOAL: { x: 100, y: 116, w: 58, h: 50, lines: ["Charcoal/", "Indian", "Cuisine"] },
  HEALTHY_HEART: { x: 160, y: 116, w: 58, h: 50, lines: ["Healthy", "Heart"] },
  ROTI_GHEE: { x: 40, y: 172, w: 58, h: 50, lines: ["Indian Roti", "Basket/", "Ghee"] },
  AIR_FRY: { x: 100, y: 172, w: 58, h: 50, lines: ["Air Fry/", "Low", "Calorie"] },
  KIDS_DAIRY: { x: 160, y: 172, w: 58, h: 50, lines: ["Kids'/", "Dairy", "Delight"] },
  DIAL: { x: 100, y: 246, w: 74, h: 74, lines: [] },
  STOP: { x: 60, y: 312, w: 66, h: 54, lines: ["Cancel", "*Child Lock"] },
  START: { x: 140, y: 312, w: 66, h: 54, lines: ["Select/", "+30 seconds"] },
};

/** The control panel with the buttons to press ringed and numbered in the order they are used.
 *  The display shows `display` (the answer's menu code) or else the last display value in the steps. */
export function PanelDiagram({ steps, display }: { steps: string[]; display?: string }) {
  const order: ButtonId[] = [];
  let lastShown = "";
  for (const s of steps) {
    for (const p of parseMarkup(s)) {
      if (p.kind === "button" && !order.includes(p.id)) order.push(p.id);
      if (p.kind === "display") lastShown = p.text.replace(/\s*(°C|℃|°)$/, "");
    }
  }
  if (!order.length) return null;
  display ||= lastShown;

  return (
    <svg viewBox="0 0 200 350" className="mx-auto w-full max-w-[230px]" role="img" aria-label="पैनल पर दबाने वाले बटन">
      <rect x="2" y="2" width="196" height="346" rx="26" fill="#17151c" />
      <text x="100" y="26" textAnchor="middle" fill="#d9d8df" fontSize="12" fontWeight="600">ThinQ</text>
      <rect x="44" y="38" width="112" height="44" rx="6" fill="#0b0a0e" />
      <text x="100" y="70" textAnchor="middle" fontFamily="var(--font-dseg)" fontSize="22" fill="#b7b4ff" opacity="0.12">88:88</text>
      {display && (
        <text x="100" y="70" textAnchor="middle" fontFamily="var(--font-dseg)" fontSize="22" fill="#b7b4ff" className="led-glow">
          {display}
        </text>
      )}

      {(Object.keys(SPOTS) as ButtonId[]).map((id) => {
        const s = SPOTS[id];
        const n = order.indexOf(id) + 1;
        const on = n > 0;
        return (
          <g key={id}>
            {on && (id === "DIAL" ? (
              <circle cx={s.x} cy={s.y} r={s.w / 2} fill="#d6246e" fillOpacity="0.22" stroke="#ff5c9a" strokeWidth="3" />
            ) : (
              <rect x={s.x - s.w / 2} y={s.y - s.h / 2} width={s.w} height={s.h} rx="12"
                fill="#d6246e" fillOpacity="0.22" stroke="#ff5c9a" strokeWidth="3" />
            ))}
            {id === "DIAL" ? (
              <>
                <text x="64" y="218" fill="#d9d8df" fontSize="16">−</text>
                <text x="130" y="218" fill="#d9d8df" fontSize="16">+</text>
                <circle cx="100" cy="246" r="27" fill="#1c1a22" stroke="#c8a25c" strokeWidth="4.5" />
                <circle cx="100" cy="246" r="15" fill="#26232d" />
              </>
            ) : id === "STOP" || id === "START" ? (
              <>
                <text x={s.x} y={s.y - 9} textAnchor="middle" fontSize="13.5" fontWeight="700" fill={id === "STOP" ? "#ff5c5c" : "#f1f0f4"}>
                  {id === "STOP" ? "STOP" : "◇START"}
                </text>
                <rect x={s.x - 21} y={s.y - 5} width="42" height="2.5" rx="1" fill={id === "STOP" ? "#e5484d" : "#f1f0f4"} />
                {s.lines.map((l, i) => (
                  <text key={l} x={s.x} y={s.y + 8 + i * 10} textAnchor="middle" fontSize="8.5" fill="#bdbbc6">{l}</text>
                ))}
              </>
            ) : (
              s.lines.map((l, i) => (
                <text key={l} x={s.x} y={s.y - (s.lines.length - 1) * 6 + i * 12 + 4} textAnchor="middle"
                  fontSize={l.startsWith("*") ? 8 : 10.5} fill={on ? "#ffffff" : "#bdbbc6"} fontWeight={on ? 700 : 500}>
                  {l}
                </text>
              ))
            )}
            {on && (() => {
              // The badge sits on the ring's top-right, clear of the label.
              const bx = id === "DIAL" ? s.x + s.w * 0.36 : s.x + s.w / 2 - 2;
              const by = id === "DIAL" ? s.y - s.w * 0.36 : s.y - s.h / 2 - 2;
              return (
                <g>
                  <circle cx={bx} cy={by} r="10" fill="#ffb020" stroke="#17151c" strokeWidth="2" />
                  <text x={bx} y={by + 4.5} textAnchor="middle" fontSize="12" fontWeight="800" fill="#3a1f3d">{n}</text>
                </g>
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}
