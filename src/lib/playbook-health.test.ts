import { describe, expect, it } from "vitest";
import { missingPlaybooks, workspaceState } from "./playbook-health";

describe("missingPlaybooks", () => {
  it("returns the names the agent cannot see", () => {
    expect(missingPlaybooks(["a", "b", "c"], new Set(["a", "c"]))).toEqual(["b"]);
  });

  it("returns an empty list when everything is installed", () => {
    expect(missingPlaybooks(["a"], new Set(["a", "z"]))).toEqual([]);
  });

  it("returns an empty list for a workspace that names no playbook", () => {
    // Proxied backends have none; they are not degraded for lacking them.
    expect(missingPlaybooks([], undefined)).toEqual([]);
    expect(missingPlaybooks([], new Set())).toEqual([]);
  });

  it("distinguishes 'could not check' from 'nothing missing'", () => {
    // Rendering an unreadable skill list as healthy is how a broken install
    // goes unnoticed — the whole reason this returns undefined.
    expect(missingPlaybooks(["a"], undefined)).toBeUndefined();
    expect(missingPlaybooks(["a"], new Set(["a"]))).toEqual([]);
  });
});

describe("workspaceState", () => {
  it("is ok when the backend answers and the playbooks are present", () => {
    expect(workspaceState("ok", [])).toBe("ok");
  });

  it("is degraded when the backend answers but a playbook is missing", () => {
    expect(workspaceState("ok", ["pricing-strategy"])).toBe("degraded");
  });

  it("reports the backend problem first when the upstream is down", () => {
    // A down upstream is the actionable fact; missing playbooks are moot.
    expect(workspaceState("down", ["pricing-strategy"])).toBe("down");
    expect(workspaceState("unknown", undefined)).toBe("unknown");
  });

  it("is ok when the playbooks could not be checked", () => {
    // Unverifiable is not the same as broken; the nav must not cry wolf every
    // time the skills endpoint times out.
    expect(workspaceState("ok", undefined)).toBe("ok");
  });
});
