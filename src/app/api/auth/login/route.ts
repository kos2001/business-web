import { NextResponse } from "next/server";
import { beginLogin, safeNext, TX_COOKIE, TX_MAX_AGE_SECONDS } from "@/lib/oidc";

export const dynamic = "force-dynamic";

/** Starts the OIDC round trip: park the transaction, redirect to the IdP. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));

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
