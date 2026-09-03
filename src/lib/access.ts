/**
 * The authorization list — who is allowed in, and who may change that.
 *
 * ## Authentication is not authorization
 *
 * OIDC answers "who is this person"; a corporate IdP will happily prove the
 * identity of everyone in the company. This file answers the separate question
 * of whether *this* person may use *this* app, which matters because the
 * workspaces carry customer data, pricing and contract terms.
 *
 * Two ways in, checked in this order:
 *
 * 1. **A person entry** — an exact email address. Carries a role.
 * 2. **A domain rule** — everyone whose email ends in `@example.com`. Members
 *    only; an admin is always named individually, because "anyone at the
 *    company can change the access list" is not an access list.
 *
 * ## Where it lives
 *
 * A JSON file next to the staging directory, not a database: the app already
 * assumes a single instance with a local filesystem (see staging.ts), and an
 * access list that a person can read and fix with a text editor is a feature
 * when the thing that is broken is the login.
 *
 * Writes go through a temp file and a rename so a crash mid-write cannot leave
 * a truncated list — which would lock everyone out, including the admin who
 * would have to fix it.
 *
 * ## Bootstrap
 *
 * An empty list plus a login page is a locked door with the key inside. The
 * first admins therefore come from `ACCESS_BOOTSTRAP_ADMINS` in the
 * environment: those addresses are treated as admins even when the file is
 * empty, and are written into it on first login. Once real admins exist the
 * variable can go.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

export type Role = "admin" | "member";

export interface Person {
  /** Lower-cased email. The IdP's `email` claim. */
  email: string;
  role: Role;
  /** Email of whoever added them, or "bootstrap" / "system". */
  addedBy: string;
  /** ISO-8601. */
  addedAt: string;
  /** Free-text, e.g. the team they are on. */
  note?: string;
}

export interface DomainRule {
  /** Bare domain, lower-cased, no "@". */
  domain: string;
  addedBy: string;
  addedAt: string;
}

export interface AccessList {
  people: Person[];
  domains: DomainRule[];
}

/**
 * A fresh empty list every time.
 *
 * Not a shared `EMPTY` constant: callers mutate what they get back — `push` in
 * upsertPerson, for one — and a shallow copy of a constant still points at the
 * same arrays, so entries would accumulate on a module-level object across
 * requests. Caught by access.test.ts.
 */
function emptyList(): AccessList {
  return { people: [], domains: [] };
}

export function accessFilePath(): string {
  return (
    process.env.ACCESS_LIST_PATH ??
    join(homedir(), ".hermes", "business-web-access.json")
  );
}

/** Addresses that are admins regardless of the file. See "Bootstrap" above. */
export function bootstrapAdmins(): string[] {
  return (process.env.ACCESS_BOOTSTRAP_ADMINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function readAccessList(): AccessList {
  try {
    const raw = readFileSync(accessFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AccessList>;
    return {
      people: Array.isArray(parsed.people) ? parsed.people : [],
      domains: Array.isArray(parsed.domains) ? parsed.domains : [],
    };
  } catch {
    // Missing is the normal first-run state. Unreadable or malformed is not,
    // but failing closed to the bootstrap admins is the safe reading either
    // way — it never grants access the file did not.
    return emptyList();
  }
}

export function writeAccessList(list: AccessList): void {
  const path = accessFilePath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  // 0600: the list names employees, and on a shared machine it is nobody
  // else's business.
  writeFileSync(tmp, JSON.stringify(list, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  renameSync(tmp, path);
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function domainOf(email: string): string {
  return normaliseEmail(email).split("@")[1] ?? "";
}

/** The role this address has, or null when it has no access at all. */
export function roleOf(email: string, list = readAccessList()): Role | null {
  const addr = normaliseEmail(email);
  if (!addr.includes("@")) return null;

  if (bootstrapAdmins().includes(addr)) return "admin";

  const person = list.people.find((p) => normaliseEmail(p.email) === addr);
  if (person) return person.role;

  const domain = domainOf(addr);
  if (domain && list.domains.some((d) => d.domain.toLowerCase() === domain)) {
    return "member";
  }

  return null;
}

export function isAuthorized(email: string, list = readAccessList()): boolean {
  return roleOf(email, list) !== null;
}

export function isAdmin(email: string, list = readAccessList()): boolean {
  return roleOf(email, list) === "admin";
}

/** Add or update a person. Returns the list actually written. */
export function upsertPerson(
  entry: Omit<Person, "addedAt"> & { addedAt?: string },
): AccessList {
  const list = readAccessList();
  const email = normaliseEmail(entry.email);
  const existing = list.people.find((p) => normaliseEmail(p.email) === email);

  if (existing) {
    existing.role = entry.role;
    if (entry.note !== undefined) existing.note = entry.note;
  } else {
    list.people.push({
      ...entry,
      email,
      addedAt: entry.addedAt ?? new Date().toISOString(),
    });
  }

  writeAccessList(list);
  return list;
}

/**
 * Remove a person.
 *
 * Refuses to remove the last admin. Locking every administrator out of the
 * settings page leaves editing the JSON by hand as the only way back, and the
 * person best placed to make that mistake is the one admin still logged in.
 */
export function removePerson(email: string): {
  list: AccessList;
  removed: boolean;
  reason?: string;
} {
  const list = readAccessList();
  const addr = normaliseEmail(email);
  const target = list.people.find((p) => normaliseEmail(p.email) === addr);

  if (!target) return { list, removed: false, reason: "목록에 없습니다." };

  if (target.role === "admin") {
    const admins = list.people.filter((p) => p.role === "admin");
    if (admins.length <= 1 && bootstrapAdmins().length === 0) {
      return {
        list,
        removed: false,
        reason:
          "마지막 관리자는 삭제할 수 없습니다. 다른 관리자를 먼저 추가하세요.",
      };
    }
  }

  const next: AccessList = {
    ...list,
    people: list.people.filter((p) => normaliseEmail(p.email) !== addr),
  };
  writeAccessList(next);
  return { list: next, removed: true };
}

export function addDomain(domain: string, addedBy: string): AccessList {
  const list = readAccessList();
  const clean = domain.trim().toLowerCase().replace(/^@/, "");
  if (clean && !list.domains.some((d) => d.domain === clean)) {
    list.domains.push({
      domain: clean,
      addedBy,
      addedAt: new Date().toISOString(),
    });
    writeAccessList(list);
  }
  return list;
}

export function removeDomain(domain: string): AccessList {
  const list = readAccessList();
  const clean = domain.trim().toLowerCase().replace(/^@/, "");
  const next: AccessList = {
    ...list,
    domains: list.domains.filter((d) => d.domain !== clean),
  };
  writeAccessList(next);
  return next;
}

/**
 * Write a bootstrap admin into the file on their first login, so the list stops
 * depending on an environment variable that someone will eventually remove.
 */
export function persistBootstrapAdmin(email: string): void {
  const addr = normaliseEmail(email);
  if (!bootstrapAdmins().includes(addr)) return;
  const list = readAccessList();
  if (list.people.some((p) => normaliseEmail(p.email) === addr)) return;
  upsertPerson({ email: addr, role: "admin", addedBy: "bootstrap" });
}
