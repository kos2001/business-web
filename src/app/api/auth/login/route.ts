import { NextResponse } from "next/server";
import { beginLogin, TX_COOKIE, TX_MAX_AGE_SECONDS } from "@/lib/oidc";

export const dynamic = "force-dynamic";

/** Starts the OIDC round trip: park the transaction, redirect to the IdP. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = url.searchParams.get("next") ?? "/";

  // Only same-site paths. Reflecting an arbitrary `next` back as a redirect is
  // an open redirect: the login link is exactly what a phishing page wants to
  // borrow, since it starts on a domain the user trusts.
  const next = requested.startsWith("/") && !requested.startsWith("//")
    ? requested
    : "/";

  try {
    const { url: authUrl, tx } = await beginLogin(next);
    const res = NextResponse.redirect(authUrl);
    res.cookies.set(TX_COOKIE, JSON.stringify(tx), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: TX_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, url.origin),
    );
  }
}
