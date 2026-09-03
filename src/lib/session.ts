/**
 * The browser session — a signed cookie naming who is logged in.
 *
 * ## Why a signed cookie rather than a server-side session table
 *
 * The app already assumes one instance with local state, so a table would buy
 * nothing here; and a self-contained token means a dev-server restart does not
 * log the whole team out. The trade is that a session cannot be revoked before
 * it expires — so the lifetime is short (8 hours, one working day) and, more
 * importantly, **authorization is re-checked on every request** against the
 * access list rather than trusted from the cookie. Removing someone from the
 * list therefore takes effect immediately, which is the property that actually
 * matters when somebody leaves.
 *
 * The cookie carries the identity claims only. The role is deliberately *not*
 * read from it at authorization time (see middleware and the access API).
 *
 * ## The signing key
 *
 * `SESSION_SECRET`, minimum 32 bytes. There is no built-in default: a shipped
 * fallback secret is the same as no signature at all, since anyone could mint a
 * cookie for any address on the access list. Login is disabled without it.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "bw_session";
const ISSUER = "business-web";
const MAX_AGE_SECONDS = 8 * 60 * 60;

export interface SessionUser {
  /** The IdP's stable subject id. */
  sub: string;
  email: string;
  name?: string;
}

function secret(): Uint8Array {
  const raw = process.env.SESSION_SECRET ?? "";
  if (raw.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or shorter than 32 characters. Generate one " +
        'with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return new TextEncoder().encode(raw);
}

/** True when the app is configured to require a login at all. */
export function authConfigured(): boolean {
  return Boolean(process.env.OIDC_ISSUER && (process.env.SESSION_SECRET ?? "").length >= 32);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

/** The user in a token, or null when it is absent, expired or forged. */
export async function readSessionToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!payload.sub || !email) return null;
    return {
      sub: payload.sub,
      email,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Lax rather than strict: the OIDC provider redirects back to us as a
    // top-level navigation, and strict would withhold the cookie on that hop.
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    // Off on plain-HTTP localhost, on everywhere else. A Secure cookie is
    // simply never sent over http://, which would break local development.
    secure: process.env.NODE_ENV === "production",
  };
}

/** The signed-in user for this request, from the cookie store. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}
