import { describe, expect, it } from "vitest";
import {
  AGENTS,
  STAGES,
  findAgent,
  referencedPlaybooks,
  unreachablePlaybooks,
} from "./agents";
import { ALWAYS_ON_PLAYBOOK, PLAYBOOKS } from "./playbooks";

/**
 * These assertions exist because the roster's coupling to the hermes profile is
 * invisible at runtime. Naming a playbook that is not installed does not throw —
 * the agent just cannot find the skill and falls back on its persona, which
 * reads as a worse answer rather than as a bug. See playbooks.ts.
 */
describe("roster ↔ playbook manifest", () => {
  it("names only playbooks that exist in the manifest", () => {
    const known = new Set<string>(PLAYBOOKS);
    const unknown = referencedPlaybooks().filter((p) => !known.has(p));
    expect(unknown).toEqual([]);
  });

  it("leaves no playbook unreachable from the UI", () => {
    // The whole point of the roster rewrite: 32 of the 40 seeded playbooks had
    // no workspace pointing at them, so the team could not get at them.
    expect(unreachablePlaybooks()).toEqual([]);
  });

  it("does not give the always-on playbook a workspace", () => {
    // customer-data-handling governs every task and lives in SOUL.md. A
    // workspace for it would imply the others are exempt.
    expect(referencedPlaybooks()).not.toContain(ALWAYS_ON_PLAYBOOK);
    expect(PLAYBOOKS).not.toContain(ALWAYS_ON_PLAYBOOK);
  });

  it("points every playbook at exactly one workspace", () => {
    // Two workspaces claiming one playbook means the user has to guess which to
    // open, and the two `instructions` will drift apart.
    const owners = new Map<string, string[]>();
    for (const agent of AGENTS)
      for (const p of agent.playbooks)
        owners.set(p, [...(owners.get(p) ?? []), agent.slug]);

    const shared = [...owners].filter(([, slugs]) => slugs.length > 1);
    expect(shared).toEqual([]);
  });
});

describe("roster shape", () => {
  it("has unique slugs", () => {
    const slugs = AGENTS.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("puts every workspace in a known stage", () => {
    const stages = new Set<string>(STAGES);
    expect(AGENTS.filter((a) => !stages.has(a.stage))).toEqual([]);
  });

  it("leaves no stage empty", () => {
    // An empty stage renders as a bare heading in the nav.
    for (const stage of STAGES)
      expect(AGENTS.some((a) => a.stage === stage)).toBe(true);
  });

  it("gives every workspace starters and a blurb", () => {
    for (const agent of AGENTS) {
      expect(agent.starters.length, agent.slug).toBeGreaterThan(0);
      expect(agent.blurb.length, agent.slug).toBeGreaterThan(0);
    }
  });

  it("routes every shared-profile workspace with instructions", () => {
    // Workspaces on the shared `sales-agent` profile have no other way to say
    // which playbook they are for. Ones on a dedicated profile (contract) or a
    // non-hermes backend (mi-report, diagnosis) do not need them.
    for (const agent of AGENTS) {
      if (agent.backend !== "hermes") continue;
      if (agent.upstream !== "sales-agent") continue;
      expect(agent.instructions, agent.slug).toBeTruthy();
    }
  });

  it("names each of its playbooks inside its own instructions", () => {
    // Declaring a playbook the prompt never mentions would pass the coverage
    // test above while the agent still never reaches for it.
    for (const agent of AGENTS) {
      if (!agent.instructions) continue;
      for (const p of agent.playbooks)
        expect(agent.instructions, `${agent.slug} → ${p}`).toContain(p);
    }
  });

  it("finds agents by slug and rejects unknown ones", () => {
    expect(findAgent("pipeline")?.label).toBe("딜·파이프라인");
    expect(findAgent("nope")).toBeUndefined();
  });
});
