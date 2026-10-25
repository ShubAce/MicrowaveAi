"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import "./floral.css";

// The flowers of the app. A toran of marigolds and mango leaves hangs over the home screen, like the
// bandhanwar on her front door; the same marigolds come back quietly as the step numbers, beside the
// heading, on the recipe-book card and as a small rangoli at the doorstep (the end of the home
// screen). Gold line work, like the art on the microwave's door, finishes an answer's title and the
// footer's edge. Every piece is decorative only: hidden from screen readers and never in a tap's way.

type Tone = readonly [shade: string, outer: string, mid: string, inner: string, eye: string];
const ORANGE: Tone = ["#d4680e", "#f28c18", "#ffa623", "#ffc94a", "#e57a10"];
const YELLOW: Tone = ["#e09400", "#ffb020", "#ffc83d", "#ffe07a", "#f29a0c"];
const LEAF_DARK = "#4f8a3c";
const LEAF_LIGHT = "#7cb342";
const RANI = "#d6246e";
const GENDA = "#ffb020";

const n2 = (v: number) => Math.round(v * 100) / 100;

/** A ring of n round petals standing on a circle of radius r (a scalloped disc around 0,0). */
function ring(r: number, n: number, turn = 0): string {
  const step = (2 * Math.PI) / n;
  const arc = n2(r * Math.sin(step / 2));
  let d = "";
  for (let k = 0; k <= n; k++) {
    const a = turn + k * step;
    const p = `${n2(r * Math.cos(a))} ${n2(r * Math.sin(a))}`;
    d += k ? `A${arc} ${arc} 0 0 1 ${p}` : `M${p}`;
  }
  return `${d}Z`;
}

// One marigold, radius about 10: three ruffled rings and a small eye.
const OUTER = ring(8.1, 13);
const MID = ring(5.8, 11, 0.3);
const INNER = ring(3.5, 8, 0.15);

function Bloom({ tone = ORANGE }: { tone?: Tone }) {
  return (
    <>
      <path d={OUTER} fill={tone[0]} transform="translate(.5 .9)" />
      <path d={OUTER} fill={tone[1]} />
      <path d={MID} fill={tone[2]} />
      <path d={INNER} fill={tone[3]} />
      <circle r="1.6" fill={tone[4]} />
    </>
  );
}

// A mango leaf hanging down from 0,0 (about 21 long): darker right half, lit left half.
const LEAF = "M0 0C5.4 3.6 5.2 13 .9 21C-3.2 15-4.8 4.8 0 0Z";
const LEAF_LIT = "M0 0C-4.8 4.8-3.2 15 .9 21C1.3 13 1 6 0 0Z";

/** `back` is a shade deeper, for leaves that sit behind others. */
function Leaf({ back = false }: { back?: boolean }) {
  return (
    <>
      <path d={LEAF} fill={back ? "#3f7631" : LEAF_DARK} />
      <path d={LEAF_LIT} fill={back ? "#679d38" : LEAF_LIGHT} />
    </>
  );
}

const at = (x: number, y: number, s = 1, a = 0) => `translate(${n2(x)} ${n2(y)})${a ? ` rotate(${a})` : ""}${s !== 1 ? ` scale(${s})` : ""}`;

// ---------------------------------------------------------------- the toran over the home screen

// It is hung once per visit, when the app opens, not every time she comes back to the home screen.
let hung = false;

/**
 * Drawn 600 wide around the centre and cropped to the screen, so it stays symmetric on any phone.
 * Marigolds (orange and yellow by turns) hang from a mauli cord at the top edge, with three mango
 * leaves between each two.
 */
export function Toran() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [fresh] = useState(() => !hung);
  useEffect(() => {
    hung = true;
  }, []);
  const gap = 44;
  const swing = (i: number) => (fresh ? { className: "fl-hang", style: { "--i": i } as CSSProperties } : {});
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-x-0 top-0 block select-none" width="100%" height="26" viewBox="0 0 600 26" preserveAspectRatio="xMidYMin slice">
      <defs>
        <g id={`${id}o`}><Bloom tone={ORANGE} /></g>
        <g id={`${id}y`}><Bloom tone={YELLOW} /></g>
        <g id={`${id}l`}><Leaf /></g>
        <g id={`${id}b`}><Leaf back /></g>
      </defs>
      <path d="M-10 1.4H610" fill="none" stroke={RANI} strokeWidth="2.8" />
      <path d="M-10 1.4H610" fill="none" stroke="#ffd36b" strokeWidth="1.2" strokeDasharray="2 3" />
      {Array.from({ length: 14 }, (_, j) => {
        const k = j - 7;
        const x = 300 + k * gap + gap / 2;
        return (
          <g key={`l${k}`} {...swing(Math.abs(k + 0.5))}>
            <use href={`#${id}b`} transform={at(x - 3, 1, 0.78, 26)} />
            <use href={`#${id}b`} transform={at(x + 3, 1, 0.78, -26)} />
            <use href={`#${id}l`} transform={at(x, 1, 0.8)} />
          </g>
        );
      })}
      {Array.from({ length: 15 }, (_, j) => {
        const k = j - 7;
        return (
          <g key={`f${k}`} {...swing(Math.abs(k))}>
            <use href={`#${id}${k % 2 ? "y" : "o"}`} transform={at(300 + k * gap, 5.5, 0.98)} />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- small marigold pieces

/** Flower, leaf and a trail of dots, either side of a heading. */
export function HeadingSprig({ side }: { side: "left" | "right" }) {
  return (
    <svg aria-hidden width="58" height="20" viewBox="0 0 58 20" className={`pointer-events-none block h-5 w-auto max-w-full shrink select-none ${side === "left" ? "-scale-x-100" : ""}`}>
      <g transform="translate(16 10) rotate(-90) scale(.8)">
        <Leaf />
      </g>
      <g transform="translate(9 10) scale(.7)">
        <Bloom />
      </g>
      <circle cx="41" cy="10" r="2" fill={RANI} opacity=".55" />
      <circle cx="48" cy="10" r="1.6" fill={GENDA} />
      <circle cx="54" cy="10" r="1.2" fill={RANI} opacity=".4" />
    </svg>
  );
}

/** A marigold and a bud with three leaves, tucked over a card's top-right corner. */
export function CardMarigolds() {
  return (
    <svg aria-hidden width="64" height="52" viewBox="0 0 64 52" className="pointer-events-none absolute -right-2.5 -top-4 select-none">
      <g transform={at(42, 20, 1, 200)}>
        <Leaf />
      </g>
      <g transform={at(42, 20, 1, 245)}>
        <Leaf />
      </g>
      <g transform={at(42, 20, 0.9, 160)}>
        <Leaf />
      </g>
      <g transform={at(30, 24, 0.7)}>
        <Bloom tone={YELLOW} />
      </g>
      <g transform={at(44, 22, 1.05)}>
        <Bloom />
      </g>
    </svg>
  );
}

/** A small rangoli at the doorstep, closing the home screen. */
export function Rangoli() {
  return (
    <svg aria-hidden width="76" height="76" viewBox="-38 -38 76 76" className="pointer-events-none mx-auto mt-8 block select-none">
      {Array.from({ length: 16 }, (_, k) => {
        const a = (k * Math.PI) / 8;
        return <circle key={`d${k}`} cx={n2(34 * Math.sin(a))} cy={n2(-34 * Math.cos(a))} r="1.7" fill={k % 2 ? GENDA : RANI} opacity={k % 2 ? 1 : 0.6} />;
      })}
      {Array.from({ length: 8 }, (_, k) => (
        <path key={`p${k}`} d="M0-11C6-15 6-24 0-29C-6-24-6-15 0-11Z" transform={`rotate(${k * 45})`} fill={k % 2 ? "#ffc7dc" : "#ffd27a"} />
      ))}
      {Array.from({ length: 8 }, (_, k) => {
        const a = ((k + 0.5) * Math.PI) / 4;
        return <circle key={`s${k}`} cx={n2(22 * Math.sin(a))} cy={n2(-22 * Math.cos(a))} r="2.1" fill={LEAF_LIGHT} />;
      })}
      <Bloom />
    </svg>
  );
}

/** A marigold between two leaves, under the settings sheet's handle. */
export function SheetSprig() {
  return (
    <svg aria-hidden width="96" height="20" viewBox="-48 -10 96 20" className="pointer-events-none mx-auto -mt-2 mb-2 block select-none">
      <g transform="translate(-6 0) rotate(90) scale(.8)">
        <Leaf />
      </g>
      <g transform="translate(6 0) rotate(-90) scale(.8)">
        <Leaf />
      </g>
      <g transform="scale(.75)">
        <Bloom />
      </g>
      <circle cx="-34" cy="0" r="1.8" fill={RANI} opacity=".5" />
      <circle cx="34" cy="0" r="1.8" fill={RANI} opacity=".5" />
      <circle cx="-41" cy="0" r="1.3" fill={GENDA} />
      <circle cx="41" cy="0" r="1.3" fill={GENDA} />
    </svg>
  );
}

// ---------------------------------------------------------------- the step number

// A marigold: a green bud while the step waits, in full orange bloom while it is spoken. The number
// sits on a plain disc, so it reads as clearly as before.
const BADGE_OUT = ring(17, 16);
const BADGE_MID = ring(13.6, 14, 0.2);
const BADGE_ON = ["#f28c18", GENDA, "#fff4d2"];
const BADGE_WAIT = ["#bcd89a", "#d5e8bf", "#f4f9ec"];

export function StepMarigold({ n, active }: { n: number; active: boolean }) {
  const [outer, mid, disc] = active ? BADGE_ON : BADGE_WAIT;
  return (
    <span className="relative grid size-10 shrink-0 place-items-center">
      <svg aria-hidden viewBox="-20 -20 40 40" className="absolute inset-0 size-full overflow-visible">
        <path d={BADGE_OUT} fill={outer} />
        <path d={BADGE_MID} fill={mid} />
        <circle r="12.2" fill={disc} />
      </svg>
      <span className={`relative font-extrabold leading-none text-baingan ${n > 9 ? "text-[1.0625rem]" : "text-[1.3125rem]"}`}>{n}</span>
    </span>
  );
}

// ---------------------------------------------------------------- gold line work, like the door art

type V = [number, number];
type Seg = [V, V, V, V];
const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The first part (0..t) of a cubic. */
function head(c: Seg, t: number): Seg {
  const ab = lerp(c[0], c[1], t);
  const bc = lerp(c[1], c[2], t);
  const abc = lerp(ab, bc, t);
  return [c[0], ab, abc, lerp(abc, lerp(bc, lerp(c[2], c[3], t), t), t)];
}

const LEAF_A: Seg = [[0, 0], [0.3, -0.34], [0.72, -0.38], [1, 0.03]];
const LEAF_B: Seg = [[0, 0], [0.34, 0.12], [0.7, 0.2], [1, 0.03]];

/** A line-art leaf like the sprig on the door: two edges meeting at the tip, and a vein between. */
function lineLeaf(base: V, deg: number, len: number, cw = true): string[] {
  const lines = [LEAF_A, LEAF_B, head(LEAF_A.map((p, j) => lerp(p, LEAF_B[j], 0.5)) as Seg, 0.78)];
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  const pt = ([x, y0]: V) => {
    const y = cw ? -y0 : y0;
    return `${n2(base[0] + (x * c - y * s) * len)} ${n2(base[1] + (x * s + y * c) * len)}`;
  };
  return lines.map((g) => `M${pt(g[0])}C${pt(g[1])} ${pt(g[2])} ${pt(g[3])}`);
}

// A stem with two leaves near its start, running out to a dot.
const FLOURISH = ["M4 12C30 9 60 13.5 108 10", ...lineLeaf([18, 11], -38, 13, false), ...lineLeaf([30, 10.5], 30, 12)];

/** Under an answer's title. */
export function TitleFlourish() {
  return (
    <svg aria-hidden viewBox="0 0 120 20" className="pointer-events-none -mt-3 block h-5 w-30 select-none text-[#bb944f]">
      <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
        {FLOURISH.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <circle cx="112" cy="10" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** Under the sticky headers: an opaque strip, so text scrolling under the header ends cleanly, with
 *  marigold dots between two gold threads. */
export function HeaderTrim() {
  return <div aria-hidden className="fl-trim pointer-events-none absolute inset-x-0 top-full" />;
}
