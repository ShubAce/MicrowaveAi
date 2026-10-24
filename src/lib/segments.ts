import { spokenPiece } from "./markup";
import type { Answer, Segment } from "./protocol";

/** The spoken pieces of an answer, in the order the server streams them: intro, steps, warning, closing. */
export function segmentsOf(a: Answer): Segment[] {
  const out: Segment[] = [];
  const add = (role: Segment["role"], markup: string | undefined, step?: number) => {
    if (markup?.trim()) out.push({ index: out.length, role, markup, ...(step ? { step } : {}) });
  };
  add("intro", a.intro);
  a.steps.forEach((s, i) => add("step", s, i + 1));
  add("warning", a.warning);
  add("closing", a.closing);
  return out;
}

/** What the voice says for one piece of a complete answer (same words the server would use). */
export const speechFor = (a: Answer, s: Segment) =>
  spokenPiece(s.role, s.markup, { kind: a.kind, step: s.step, isLast: s.step === a.steps.length });

/** Where a quick answer's ready-made audio lives (public/tiles/<voice>/<tile>-<piece>.mp3). */
export const tileAudioUrl = (voice: string, tileId: string, index: number) => `/tiles/${voice}/${tileId}-${index}.mp3`;
