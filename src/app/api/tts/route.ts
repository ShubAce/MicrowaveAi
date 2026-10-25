import { safePace, safeVoice } from "@/lib/server/sarvam";
import { say } from "@/lib/server/voice";

/** One piece of speech: voice previews, and quick answers in voices without ready-made audio. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 400) : "";
  if (!text) return Response.json({ error: "no text" }, { status: 400 });
  try {
    const { b64, mime } = await say(text, safeVoice(body.voice), safePace(body.pace), req.signal);
    return new Response(Buffer.from(b64, "base64"), {
      headers: { "Content-Type": mime, "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("text-to-speech failed:", (e as Error).message);
    return Response.json({ error: "text-to-speech failed" }, { status: 502 });
  }
}
