import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addDomain,
  isAdmin,
  isAuthorized,
  persistBootstrapAdmin,
  readAccessList,
  removeDomain,
  removePerson,
  roleOf,
  upsertPerson,
} from "./access";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bw-access-"));
  process.env.ACCESS_LIST_PATH = join(dir, "access.json");
  delete process.env.ACCESS_BOOTSTRAP_ADMINS;
});

afterEach(() => {
  delete process.env.ACCESS_LIST_PATH;
  delete process.env.ACCESS_BOOTSTRAP_ADMINS;
  rmSync(dir, { recursive: true, force: true });
});

describe("default posture", () => {
  it("denies everyone when the list does not exist yet", () => {
    // Fail closed. A missing file is the first-run state, and first run must
    // not mean open to the internet.
    expect(isAuthorized("anyone@example.com")).toBe(false);
    expect(roleOf("anyone@example.com")).toBeNull();
  });

  it("denies a value that is not an address", () => {
    upsertPerson({ email: "hong@example.com", role: "member", addedBy: "t" });
    expect(isAuthorized("")).toBe(false);
    expect(isAuthorized("hong")).toBe(false);
  });
});

describe("people", () => {
  it("authorizes someone on the list with their role", () => {
    upsertPerson({ email: "hong@example.com", role: "admin", addedBy: "t" });
    expect(roleOf("hong@example.com")).toBe("admin");
    expect(isAdmin("hong@example.com")).toBe(true);
  });

  it("matches addresses case-insensitively", () => {
    // IdPs are inconsistent about casing; an admin typing Hong@Example.com
    // must not create a second, dead entry.
    upsertPerson({ email: "Hong@Example.com", role: "member", addedBy: "t" });
    expect(isAuthorized("hong@example.com")).toBe(true);
    expect(isAuthorized("HONG@EXAMPLE.COM")).toBe(true);
  });

  it("updates the role in place rather than duplicating the person", () => {
    upsertPerson({ email: "hong@example.com", role: "member", addedBy: "t" });
    upsertPerson({ email: "hong@example.com", role: "admin", addedBy: "t" });
    expect(readAccessList().people).toHaveLength(1);
    expect(isAdmin("hong@example.com")).toBe(true);
  });

  it("records who granted access and when", () => {
    // Without provenance the list is unauditable — the first question about an
    // unexpected name is who added it.
    upsertPerson({ email: "hong@example.com", role: "member", addedBy: "kim@example.com" });
    const [entry] = readAccessList().people;
    expect(entry.addedBy).toBe("kim@example.com");
    expect(Date.parse(entry.addedAt)).not.toBeNaN();
  });

  it("removes a person", () => {
    upsertPerson({ email: "a@example.com", role: "admin", addedBy: "t" });
    upsertPerson({ email: "b@example.com", role: "member", addedBy: "t" });
    expect(removePerson("b@example.com").removed).toBe(true);
    expect(isAuthorized("b@example.com")).toBe(false);
  });

  it("refuses to remove the last admin", () => {
    // Otherwise the only way back into the settings page is editing JSON by
    // hand, and the person best placed to make that mistake is the last admin.
    upsertPerson({ email: "solo@example.com", role: "admin", addedBy: "t" });
    const result = removePerson("solo@example.com");
    expect(result.removed).toBe(false);
    expect(result.reason).toContain("마지막 관리자");
    expect(isAdmin("solo@example.com")).toBe(true);
  });

  it("allows removing an admin once another one exists", () => {
    upsertPerson({ email: "a@example.com", role: "admin", addedBy: "t" });
    upsertPerson({ email: "b@example.com", role: "admin", addedBy: "t" });
    expect(removePerson("a@example.com").removed).toBe(true);
  });
});

describe("domain rules", () => {
  it("admits any address on an allowed domain as a member", () => {
    addDomain("example.com", "admin@example.com");
    expect(roleOf("anyone@example.com")).toBe("member");
  });

  it("never grants admin by domain", () => {
    // A domain rule admits people who have not been hired yet. Handing them
    // the access list too would make it not an access list.
    addDomain("example.com", "admin@example.com");
    expect(isAdmin("anyone@example.com")).toBe(false);
  });

  it("does not leak to a lookalike domain", () => {
    addDomain("example.com", "t");
    expect(isAuthorized("attacker@notexample.com")).toBe(false);
    expect(isAuthorized("attacker@example.com.evil.net")).toBe(false);
  });

  it("keeps an explicit person entry above the domain rule", () => {
    addDomain("example.com", "t");
    upsertPerson({ email: "boss@example.com", role: "admin", addedBy: "t" });
    expect(roleOf("boss@example.com")).toBe("admin");
  });

  it("accepts a domain typed with a leading @", () => {
    addDomain("@example.com", "t");
    expect(isAuthorized("a@example.com")).toBe(true);
  });

  it("removes a domain", () => {
    addDomain("example.com", "t");
    removeDomain("example.com");
    expect(isAuthorized("a@example.com")).toBe(false);
  });
});

describe("bootstrap admins", () => {
  it("admits the configured address even with an empty list", () => {
    // The locked-door-with-the-key-inside problem: an empty list plus a login
    // page means nobody can ever grant the first access.
    process.env.ACCESS_BOOTSTRAP_ADMINS = "founder@example.com";
    expect(isAdmin("founder@example.com")).toBe(true);
  });

  it("is case- and whitespace-tolerant in the variable", () => {
    process.env.ACCESS_BOOTSTRAP_ADMINS = " Founder@Example.com , b@example.com";
    expect(isAdmin("founder@example.com")).toBe(true);
    expect(isAdmin("b@example.com")).toBe(true);
  });

  it("does not admit anyone else", () => {
    process.env.ACCESS_BOOTSTRAP_ADMINS = "founder@example.com";
    expect(isAuthorized("other@example.com")).toBe(false);
  });

  it("writes the bootstrap admin into the file on first login", () => {
    // So the list stops depending on a variable somebody will remove.
    process.env.ACCESS_BOOTSTRAP_ADMINS = "founder@example.com";
    persistBootstrapAdmin("founder@example.com");
    const [entry] = readAccessList().people;
    expect(entry).toMatchObject({ email: "founder@example.com", role: "admin" });
    expect(entry.addedBy).toBe("bootstrap");
  });

  it("does not persist someone who is not a bootstrap admin", () => {
    process.env.ACCESS_BOOTSTRAP_ADMINS = "founder@example.com";
    persistBootstrapAdmin("stranger@example.com");
    expect(readAccessList().people).toHaveLength(0);
  });
});
