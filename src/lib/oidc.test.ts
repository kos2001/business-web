/**
 * The parts of the OIDC flow that can be checked without an identity provider:
 * the configuration gate that keeps login switched off, and the redirect guard.
 *
 * The token exchange itself is `openid-client`'s `authorizationCodeGrant`,
 * which is where the signature, issuer, audience, expiry and nonce are
 * verified. Re-testing a library against a fake IdP would mostly test the fake.
 * What is worth pinning here is that we hand it the expected state and nonce at
 * all, and that nothing runs when the app is unconfigured — which is how it
 * ships today.
 */
import { afterEach, describe, expect, it } from "vitest";
import { oidcConfigured, redirectUri, safeNext } from "./oidc";

const VARS = ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_REDIRECT_URI"] as const;

function configure(...skip: string[]) {
  for (const v of VARS) {
    if (skip.includes(v)) continue;
    process.env[v] =
      v === "OIDC_REDIRECT_URI"
        ? "http://localhost:3100/api/auth/callback"
        : "value";
  }
}

afterEach(() => {
  for (const v of VARS) delete process.env[v];
});

describe("oidcConfigured", () => {
  it("is off when nothing is set — the state this app is in", () => {
    expect(oidcConfigured()).toBe(false);
  });

  it("needs all three settings, not some of them", () => {
    for (const missing of VARS) {
      for (const v of VARS) delete process.env[v];
      configure(missing);
      expect(oidcConfigured(), `${missing} 없이 켜지면 안 됩니다`).toBe(false);
    }
    configure();
    expect(oidcConfigured()).toBe(true);
  });

  it("reports the redirect URI it will register with the IdP", () => {
    configure();
    expect(redirectUri()).toBe("http://localhost:3100/api/auth/callback");
  });

  it("returns an empty redirect URI rather than a made-up one when unset", () => {
    expect(redirectUri()).toBe("");
  });
});

describe("safeNext", () => {
  it("keeps a same-site path", () => {
    expect(safeNext("/w/contract")).toBe("/w/contract");
    expect(safeNext("/improvement?days=90")).toBe("/improvement?days=90");
  });

  it("refuses a protocol-relative path", () => {
    // //evil.example resolves to another origin entirely.
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("//evil.example/steal")).toBe("/");
  });

  it("refuses a backslash path, which some browsers normalise to //", () => {
    expect(safeNext("/\\evil.example")).toBe("/");
  });

  it("refuses an absolute URL and a scheme", () => {
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
    expect(safeNext("data:text/html,x")).toBe("/");
  });

  it("falls back to the root for absent or empty input", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });
});
