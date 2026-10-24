"use client";

import type { AskEvent, AskSettings, HistoryTurn } from "../protocol";

export class LockedError extends Error {}

/** Sends a question (audio or text) and calls onEvent for each line the server streams back. */
export async function ask({ audio, text, history, settings, onEvent, signal }: {
  audio?: { blob: Blob; filename: string };
  text?: string;
  history: HistoryTurn[];
  settings: AskSettings;
  onEvent: (e: AskEvent) => void;
  signal?: AbortSignal;
}) {
  const form = new FormData();
  if (audio) form.append("audio", audio.blob, audio.filename);
  if (text) form.append("text", text);
  form.append("history", JSON.stringify(history));
  form.append("voice", settings.voice);
  form.append("pace", String(settings.pace));

  const res = await fetch("/api/ask", { method: "POST", body: form, signal });
  if (res.status === 401) throw new LockedError("locked");
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as AskEvent);
    }
  }
}

/** Speech for one piece of text, e.g. a quick answer in a voice without ready-made audio. */
export async function speakText(text: string, settings: AskSettings, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: settings.voice, pace: settings.pace }),
    signal,
  });
  if (res.status === 401) throw new LockedError("locked");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}
