import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/session";

/**
 * The gate. Everything is closed unless it is on the list below.
 *
 * Written as a deny-by-default check rather than a list of protected paths: a
 * new route added six months from now is protected because nobody had to
 * remember to protect it. Getting this the other way round is the classic way
 * an internal tool leaks — the auth list is updated, the route list is not.
 *
 * The middleware verifies the *session signature* only. Whether the person is
 * still allowed in is re-read from the access list by the pages and APIs that
 * matter, because the middleware runs on the edge runtime where the access
 * file is not readable, and because a cached authorization is exactly what you
 * do not want when someone has just been removed.
 */

/** Reachable without a session. */
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/logout",
  // Next's own assets. `_next/static` is fingerprinted and public by design.
  "/_next",
  "/favicon.ico",
  "/icon.svg",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(req: NextRequest) {
  // Login is off entirely when no IdP is configured — the app then behaves as
  // it did before this existed, which keeps local development one command.
  // Both variables are required: an issuer without a signing secret would mean
  // unverifiable sessions.
  const authOn =
    Boolean(process.env.OIDC_ISSUER) &&
    (process.env.SESSION_SECRET ?? "").length >= 32;
  if (!authOn) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const user = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();

  // An API call gets a status it can act on; a browser navigation gets sent to
  // the login page. Redirecting fetch() to HTML would surface as a JSON parse
  // error rather than "your session ended".
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const login = new URL("/login", req.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's internals, which the check above also covers —
  // this just keeps the middleware off the hot path for static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
