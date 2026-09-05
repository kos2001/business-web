/**
 * The session cookie is the whole authentication boundary: whoever can produce
 * one is logged in as whoever it names. It shipped without a test, which is the
 * one place that is least acceptable — a signature check that silently stops
 * checking looks exactly like a signature check that works.
 *
 * These run with login switched off in the app's own configuration. Nothing
 * here turns it on; they set the signing secret for the duration of a call and
 * assert on the token, so the suite exercises the code without the app ever
 * requiring a login.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  authConfigured,
  createSessionToken,
  readSessionToken,
  sessionCookieOptions,
} from "./session";

const SECRET = "0123456789abcdef0123456789abcdef";
const OTHER = "fedcba9876543210fedcba9876543210";
const USER = { sub: "id-1", email: "someone@example.com", name: "이름" };

afterEach(() => {
  delete process.env.SESSION_SECRET;
  delete process.env.OIDC_ISSUER;
});

describe("session token", () => {
  it("round-trips the identity it was given", async () => {
    process.env.SESSION_SECRET = SECRET;
    expect(await readSessionToken(await createSessionToken(USER))).toEqual(USER);
  });

  it("rejects a token signed with a different secret", async () => {
    process.env.SESSION_SECRET = SECRET;
    const token = await createSessionToken(USER);
    process.env.SESSION_SECRET = OTHER;
    expect(await readSessionToken(token)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    process.env.SESSION_SECRET = SECRET;
    const [head, payload, sig] = (await createSessionToken(USER)).split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), email: "attacker@example.com" }),
    ).toString("base64url");
    expect(await readSessionToken(`${head}.${forged}.${sig}`)).toBeNull();
  });

  it("rejects an unsigned token, whatever its alg header claims", async () => {
    // The classic JWT mistake: alg:none accepted because the library was asked
    // to decode rather than verify.
    process.env.SESSION_SECRET = SECRET;
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const none = `${b64({ alg: "none" })}.${b64({ sub: "id-1", email: "a@b.c", iss: "business-web" })}.`;
    expect(await readSessionToken(none)).toBeNull();
  });

  it("rejects an expired token", async () => {
    // Signed with a past expiry rather than by moving the clock: jose reads its
    // own clock, so stubbing Date.now proves nothing about what it will do.
    process.env.SESSION_SECRET = SECRET;
    const { SignJWT } = await import("jose");
    const stale = await new SignJWT({ email: USER.email })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER.sub)
      .setIssuer("business-web")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 9 * 60 * 60)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(SECRET));
    expect(await readSessionToken(stale)).toBeNull();
  });

  it("rejects a token issued by something else", async () => {
    process.env.SESSION_SECRET = SECRET;
    const { SignJWT } = await import("jose");
    const foreign = await new SignJWT({ email: "a@b.c" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("id-1")
      .setIssuer("some-other-app")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    expect(await readSessionToken(foreign)).toBeNull();
  });

  it("treats a missing cookie as signed out rather than throwing", async () => {
    process.env.SESSION_SECRET = SECRET;
    expect(await readSessionToken(undefined)).toBeNull();
    expect(await readSessionToken("")).toBeNull();
  });

  it("returns null rather than a half-identity when the email is absent", async () => {
    // The access list is keyed by address, so a session without one must not
    // authenticate — it would authorize against an empty string.
    process.env.SESSION_SECRET = SECRET;
    const { SignJWT } = await import("jose");
    const noEmail = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("id-1")
      .setIssuer("business-web")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    expect(await readSessionToken(noEmail)).toBeNull();
  });

  it("refuses to sign with a secret too short to be one", async () => {
    process.env.SESSION_SECRET = "short";
    await expect(createSessionToken(USER)).rejects.toThrow(/SESSION_SECRET/);
  });
});

describe("authConfigured", () => {
  it("is off when nothing is set, which is how the app runs today", () => {
    expect(authConfigured()).toBe(false);
  });

  it("needs both an issuer and a usable secret", () => {
    process.env.OIDC_ISSUER = "https://idp.example.com";
    expect(authConfigured()).toBe(false);
    process.env.SESSION_SECRET = "tooshort";
    expect(authConfigured()).toBe(false);
    process.env.SESSION_SECRET = SECRET;
    expect(authConfigured()).toBe(true);
  });

  it("stays off with a secret but no issuer", () => {
    process.env.SESSION_SECRET = SECRET;
    expect(authConfigured()).toBe(false);
  });
});

describe("cookie options", () => {
  it("is httpOnly and lax — script-unreadable, but survives the IdP redirect", () => {
    const o = sessionCookieOptions();
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
  });

  it("expires in one working day", () => {
    expect(sessionCookieOptions().maxAge).toBe(8 * 60 * 60);
  });
});
