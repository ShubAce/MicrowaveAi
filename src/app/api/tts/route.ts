import { safePace, safeVoice, speak } from "@/lib/server/sarvam";

/** One piece of speech: voice previews, and quick answers in another voice or speed. Sarvam only:
 *  both have ready-made audio to fall back on, and Gemini's voice would honour neither the voice nor
 *  the speed asked for, while using up its small daily quota. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 400) : "";
  if (!text) return Response.json({ error: "no text" }, { status: 400 });
  try {
    const b64 = await speak(text, safeVoice(body.voice), safePace(body.pace), req.signal);
    return new Response(Buffer.from(b64, "base64"), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("text-to-speech failed:", (e as Error).message);
    return Response.json({ error: "text-to-speech failed" }, { status: 502 });
  }
}
