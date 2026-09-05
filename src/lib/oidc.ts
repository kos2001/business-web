/**
 * OIDC / SSO — the authorization-code flow with PKCE.
 *
 * ## Why a library and not fetch calls
 *
 * The protocol is short to sketch and easy to get subtly wrong: ID-token
 * signature verification against a rotating JWKS, `nonce` binding, `state`,
 * PKCE, issuer and audience checks, clock skew. Each omission is silent — the
 * login still works, it just accepts tokens it should not. `openid-client` is
 * the reference implementation for Node and does all of it, so this module is
 * only the glue: discovery, the two redirects, and the claims we keep.
 *
 * ## What it works against
 *
 * Any provider with a discovery document — Entra ID / Azure AD, Google
 * Workspace, Okta, Keycloak, Auth0. Configuration is four variables:
 *
 *   OIDC_ISSUER         https://login.microsoftonline.com/<tenant>/v2.0
 *   OIDC_CLIENT_ID
 *   OIDC_CLIENT_SECRET  omit for a public client (PKCE alone)
 *   OIDC_REDIRECT_URI   http://localhost:3100/api/auth/callback
 *
 * Leaving `OIDC_ISSUER` unset disables login entirely and the app runs open, as
 * it did before this existed. That keeps local development one command, and it
 * is why `authConfigured()` is checked before anything here is used.
 *
 * ## The transaction cookie
 *
 * `state`, `nonce` and the PKCE verifier have to survive the round trip to the
 * IdP. They go in a short-lived httpOnly cookie rather than server memory so a
 * dev-server reload mid-login does not strand the user on a failed callback.
 * It is deleted as soon as the callback consumes it.
 */

import * as client from "openid-client";

export const TX_COOKIE = "bw_oidc_tx";
/** Long enough to type a password and pass MFA, short enough to be useless later. */
export const TX_MAX_AGE_SECONDS = 10 * 60;

export interface OidcTransaction {
  state: string;
  nonce: string;
  verifier: string;
  /** Where to send the user once they are in. */
  next: string;
}

export interface OidcClaims {
  sub: string;
  email: string;
  name?: string;
}

/**
 * The post-login destination, reduced to something safe to redirect to.
 *
 * Reflecting an arbitrary `next` is an open redirect, and the login link is
 * exactly what a phishing page wants to borrow because it starts on a domain
 * the user trusts. Only a same-site absolute path survives.
 *
 * `//host` and `/\host` are both rejected: the first is protocol-relative, and
 * some browsers normalise a backslash to a forward slash before resolving, so
 * the second reaches the same place. Anything not starting with `/` — a full
 * URL, a scheme like `javascript:` — is replaced rather than repaired.
 *
 * This lived inline in the login route, where nothing could test it.
 */
export function safeNext(requested: string | null | undefined): string {
  const value = requested ?? "";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

export function oidcConfigured(): boolean {
  return Boolean(
    process.env.OIDC_ISSUER &&
      process.env.OIDC_CLIENT_ID &&
      process.env.OIDC_REDIRECT_URI,
  );
}

export function redirectUri(): string {
  return process.env.OIDC_REDIRECT_URI ?? "";
}

/** Discovery result, cached for the process — it is a network round trip. */
let configPromise: Promise<client.Configuration> | null = null;

export function discover(): Promise<client.Configuration> {
  if (!oidcConfigured()) {
    return Promise.reject(
      new Error(
        "OIDC is not configured. Set OIDC_ISSUER, OIDC_CLIENT_ID and " +
          "OIDC_REDIRECT_URI in .env.local.",
      ),
    );
  }
  configPromise ??= client.discovery(
    new URL(process.env.OIDC_ISSUER!),
    process.env.OIDC_CLIENT_ID!,
    process.env.OIDC_CLIENT_SECRET || undefined,
  );
  return configPromise;
}

/** Test seam — discovery is cached, and tests change the environment. */
export function _resetDiscovery(): void {
  configPromise = null;
}

/**
 * Build the provider URL to send the browser to, plus the transaction that the
 * callback needs to verify what comes back.
 */
export async function beginLogin(
  next: string,
): Promise<{ url: string; tx: OidcTransaction }> {
  const config = await discover();

  const verifier = client.randomPKCECodeVerifier();
  const challenge = await client.calculatePKCECodeChallenge(verifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    scope: process.env.OIDC_SCOPE ?? "openid email profile",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });

  return { url: url.href, tx: { state, nonce, verifier, next } };
}

/**
 * Exchange the code for tokens and return the verified claims.
 *
 * `expectedState` and `expectedNonce` are what make this safe: without them a
 * code injected by someone else would be accepted as a login.
 */
export async function completeLogin(
  currentUrl: URL,
  tx: OidcTransaction,
): Promise<OidcClaims> {
  const config = await discover();

  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: tx.verifier,
    expectedState: tx.state,
    expectedNonce: tx.nonce,
  });

  const claims = tokens.claims();
  if (!claims?.sub) throw new Error("ID 토큰에 sub 클레임이 없습니다.");

  // `email` is optional in the spec and some tenants only issue it with the
  // right scope or claim mapping. The whole access list is keyed by address, so
  // an identity without one cannot be authorized and must fail loudly rather
  // than fall through to a blank email.
  const email =
    typeof claims.email === "string"
      ? claims.email
      : typeof claims.preferred_username === "string" &&
          claims.preferred_username.includes("@")
        ? claims.preferred_username
        : "";

  if (!email) {
    throw new Error(
      "ID 토큰에 이메일이 없습니다. IdP 에서 email 클레임을 내보내도록 " +
        "설정하거나 OIDC_SCOPE 에 email 을 포함하세요.",
    );
  }

  return {
    sub: String(claims.sub),
    email: email.toLowerCase(),
    name: typeof claims.name === "string" ? claims.name : undefined,
  };
}
