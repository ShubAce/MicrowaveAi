import { connection } from "next/server";
import { isButtonId } from "@/lib/buttons";
import type { AskEvent, HistoryTurn } from "@/lib/protocol";
import { answerQuestion } from "@/lib/server/answer";
import { RECIPES } from "@/lib/server/kb";
import { safePace, safeVoice } from "@/lib/server/sarvam";
import { hear } from "@/lib/server/voice";

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

/** Keep-warm ping (every 20 minutes from .github/workflows/keep-warm.yml). It lives in this file so
 *  the ping wakes the same function that answers questions, and it never calls Gemini or Sarvam. */
export async function GET() {
  await connection(); // run on every request; a prerendered response would wake nothing
  return Response.json({ ok: true, at: new Date().toISOString(), menus: RECIPES.length }, { headers: { "Cache-Control": "no-store" } });
}

function parseHistory(raw: FormDataEntryValue | null): HistoryTurn[] {
  try {
    const list = JSON.parse(typeof raw === "string" ? raw : "[]");
    if (!Array.isArray(list)) return [];
    return list.slice(-6).flatMap((t): HistoryTurn[] => {
      if ((t?.role !== "user" && t?.role !== "model") || typeof t.text !== "string") return [];
      const menu = t.menu && isButtonId(t.menu.button) && typeof t.menu.code === "string"
        ? { button: t.menu.button, code: t.menu.code.slice(0, 8) }
        : undefined;
      return [{ role: t.role, text: t.text.slice(0, 1500), menu }];
    });
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  // Vercel stops this function at maxDuration. Ten seconds before that, whatever is still being worked
  // on is given up (speech still missing becomes audio_error), so `done` always reaches the phone.
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout((maxDuration - 10) * 1000)]);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected form data" }, { status: 400 });
  }
  const audio = form.get("audio");
  const text = String(form.get("text") ?? "").trim().slice(0, 500);
  if (!(audio instanceof Blob) && !text) return Response.json({ error: "no question" }, { status: 400 });
  if (audio instanceof Blob && audio.size > MAX_AUDIO_BYTES) return Response.json({ error: "recording too long" }, { status: 413 });

  const settings = { voice: safeVoice(form.get("voice")), pace: safePace(form.get("pace")) };
  const history = parseHistory(form.get("history"));
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AskEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // the phone went away; nothing to tell
        }
      };
      try {
        let question = text;
        if (audio instanceof Blob) {
          const filename = audio instanceof File && audio.name ? audio.name : "question.webm";
          const t0 = Date.now();
          try {
            const heard = await hear(audio, filename, signal);
            question = heard.text;
            console.log(`heard ${JSON.stringify({ by: heard.by, ms: Date.now() - t0, bytes: audio.size, type: audio.type })}`);
          } catch (e) {
            console.error("speech-to-text failed:", (e as Error).message);
            emit({ type: "error", code: "stt_failed", message: "speech-to-text failed" });
            return;
          }
          if (question.replace(/[\s।.,?!]/g, "").length < 2) {
            emit({ type: "error", code: "no_speech", message: "nothing heard" });
            return;
          }
        }
        emit({ type: "transcript", text: question });
        await answerQuestion({ question, history, settings, emit, signal });
      } catch (e) {
        console.error("answer failed:", (e as Error).message);
        emit({ type: "error", code: "busy", message: "answer failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
