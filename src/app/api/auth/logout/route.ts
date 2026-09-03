import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * POST, not GET: a logout on GET can be triggered by any page that embeds an
 * image pointing at it, which is a small but pointless denial of service on
 * your own users.
 *
 * This clears the local session only — it does not call the IdP's end-session
 * endpoint, so the SSO session itself survives and the next login is silent.
 * That is usually what people want on a shared internal tool; single logout is
 * a separate decision and needs the IdP's logout URL configured.
 */
export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/login", new URL(req.url).origin), {
    status: 303, // POST → GET on the redirect target
  });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
