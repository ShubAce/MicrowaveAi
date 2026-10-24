// What /api/ask streams back to the phone: one JSON object per line (NDJSON).

import type { ButtonId } from "./buttons";

export type AnswerKind = "steps" | "info" | "clarify" | "not_found" | "unclear" | "chat";

export interface Answer {
  kind: AnswerKind;
  title: string;
  intro: string;
  steps: string[];
  warning?: string;
  closing?: string;
  suggestions?: string[];
  menu?: { button: ButtonId; code: string };
  accessories?: string[];
  pages?: number[];
}

/** One spoken piece of the answer; the client highlights it while it plays. */
export type SegmentRole = "intro" | "step" | "warning" | "closing";

export interface Segment {
  index: number;
  role: SegmentRole;
  /** Step number (1-based) for role "step". */
  step?: number;
  markup: string;
}

export type AskEvent =
  | { type: "transcript"; text: string }
  | { type: "meta"; title: string; kind: AnswerKind }
  | { type: "segment"; segment: Segment }
  | { type: "audio"; index: number; mime: string; b64: string }
  | { type: "audio_error"; index: number }
  | { type: "done"; answer: Answer; model: string; ms: number }
  | { type: "error"; code: "no_speech" | "stt_failed" | "busy" | "bad_request"; message: string };

export interface HistoryTurn {
  role: "user" | "model";
  text: string;
  menu?: { button: ButtonId; code: string };
}

export interface AskSettings {
  voice: string;
  pace: number;
}
