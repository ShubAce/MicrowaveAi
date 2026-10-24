import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// Family-only access, so strangers who find the URL can't use up the API credits.
// Open https://<app>/?key=<FAMILY_KEY> once on her phone: it sets a cookie for a year.
// With no FAMILY_KEY set (local development) everything is open.

const COOKIE = "sakhi_key";

function same(a: string | undefined, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function proxy(req: NextRequest) {
  const key = process.env.FAMILY_KEY;
  if (!key) return NextResponse.next();
  const { pathname, searchParams } = req.nextUrl;

  // The keep-warm ping: GET /api/ask answers "ok" without calling any paid API.
  if (req.method === "GET" && pathname === "/api/ask") return NextResponse.next();

  if (same(searchParams.get("key") ?? undefined, key)) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("key");
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE, key, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
    return res;
  }

  if (same(req.cookies.get(COOKIE)?.value, key)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "locked" }, { status: 401 });
  return NextResponse.rewrite(new URL("/locked", req.url));
}

export const config = {
  // Everything except static files and the locked page itself.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|audio/|tiles/|manifest.webmanifest|locked).*)"],
};
