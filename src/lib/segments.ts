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

/** Where a quick answer's ready-made audio lives (public/tiles/<voice>/<tile>-<piece>.mp3). */
export const tileAudioUrl = (voice: string, tileId: string, index: number) => `/tiles/${voice}/${tileId}-${index}.mp3`;
