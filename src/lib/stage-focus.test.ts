import { describe, expect, it } from "vitest";
import { focusPoints, rollUpByWorkspace } from "./stage-focus";
import type { ActionItem } from "./actions";

const NOW = new Date("2026-09-05T00:00:00Z");
const WS = ["contract", "contract-plan", "contract-draft", "contract-ops"] as const;

function iso(offsetDays: number): string {
  return new Date(NOW.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function item(over: Partial<ActionItem> & { id: string }): ActionItem {
  return {
    title: "제목",
    owner: "김대리",
    due: iso(30),
    priority: null,
    impact: null,
    effort: null,
    status: "open",
    workspace: "contract",
    sourceText: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    note: null,
    ...over,
  };
}

const ids = (points: ReturnType<typeof focusPoints>) => points.map((p) => p.id);

describe("focusPoints", () => {
  it("says nothing when there is nothing to say", () => {
    const items = WS.map((w, n) => item({ id: `a${n}`, workspace: w }));
    expect(focusPoints({ items, workspaces: WS, now: NOW })).toEqual([]);
  });

  it("puts overdue first, ahead of larger categories", () => {
    // Five ownerless against one overdue: the single late item still leads.
    const items = [
      item({ id: "late", due: iso(-3) }),
      ...[1, 2, 3, 4, 5].map((n) => item({ id: `o${n}`, owner: null })),
    ];
    expect(ids(focusPoints({ items, workspaces: WS, now: NOW }))[0]).toBe("overdue");
  });

  it("ignores a closed item that happens to be past its date", () => {
    const items = [item({ id: "d", due: iso(-9), status: "done" })];
    expect(ids(focusPoints({ items, workspaces: WS, now: NOW }))).not.toContain("overdue");
  });

  it("calls out a 진행 중 item that has not moved in a fortnight", () => {
    const items = [
      item({ id: "s", status: "in_progress", updatedAt: new Date(NOW.getTime() - 20 * 86_400_000).toISOString() }),
    ];
    expect(ids(focusPoints({ items, workspaces: WS, now: NOW }))).toContain("stalled");
  });

  it("does not call a recently touched 진행 중 item stalled", () => {
    const items = [
      item({ id: "s", status: "in_progress", updatedAt: new Date(NOW.getTime() - 3 * 86_400_000).toISOString() }),
    ];
    expect(ids(focusPoints({ items, workspaces: WS, now: NOW }))).not.toContain("stalled");
  });

  it("separates this week from overdue", () => {
    const items = [item({ id: "w", due: iso(3) })];
    const points = focusPoints({ items, workspaces: WS, now: NOW });
    expect(ids(points)).not.toContain("overdue");
    const soon = points.find((p) => p.id === "due-soon");
    expect(soon?.itemIds).toEqual(["w"]);
  });

  it("counts an item with no owner, since nobody will do it", () => {
    const items = [item({ id: "n", owner: null })];
    expect(ids(focusPoints({ items, workspaces: WS, now: NOW }))).toContain("ownerless");
  });

  it("reports undated items as info, not as a problem", () => {
    const items = [item({ id: "u", due: null })];
    const p = focusPoints({ items, workspaces: WS, now: NOW }).find((x) => x.id === "undated");
    expect(p?.severity).toBe("info");
  });

  it("names the workspaces in the domain that have nothing captured", () => {
    const items = [item({ id: "a", workspace: "contract" })];
    const p = focusPoints({ items, workspaces: WS, now: NOW }).find((x) => x.id === "untouched");
    expect(p?.workspaces).toEqual(["contract-plan", "contract-draft", "contract-ops"]);
  });

  it("stays quiet about untouched workspaces when the whole domain is unused", () => {
    // An empty domain is the empty state's story, not a finding about it.
    const p = focusPoints({ items: [], workspaces: WS, now: NOW });
    expect(ids(p)).not.toContain("untouched");
  });

  it("carries the ids so the list can be filtered to exactly the point", () => {
    const items = [
      item({ id: "late1", due: iso(-1) }),
      item({ id: "late2", due: iso(-8) }),
      item({ id: "fine" }),
    ];
    const overdue = focusPoints({ items, workspaces: WS, now: NOW })[0];
    expect(overdue.itemIds.sort()).toEqual(["late1", "late2"]);
  });

  it("orders equal severities by size", () => {
    const items = [
      item({ id: "w1", due: iso(2) }),
      ...[1, 2, 3].map((n) => item({ id: `n${n}`, owner: null })),
    ];
    const attention = focusPoints({ items, workspaces: WS, now: NOW }).filter(
      (p) => p.severity === "attention",
    );
    expect(attention.map((p) => p.id)).toEqual(["ownerless", "due-soon"]);
  });
});

describe("rollUpByWorkspace", () => {
  it("keeps the domain's order and includes workspaces with nothing in them", () => {
    const items = [item({ id: "a", workspace: "contract-draft" })];
    expect(rollUpByWorkspace(items, WS, NOW).map((r) => r.slug)).toEqual([...WS]);
  });

  it("counts active, overdue and done separately", () => {
    const items = [
      item({ id: "a", workspace: "contract", due: iso(-2) }),
      item({ id: "b", workspace: "contract", status: "done" }),
      item({ id: "c", workspace: "contract", status: "in_progress" }),
      item({ id: "d", workspace: "contract", status: "dropped" }),
    ];
    const [c] = rollUpByWorkspace(items, ["contract"], NOW);
    expect(c).toEqual({ slug: "contract", total: 4, active: 2, overdue: 1, done: 1 });
  });
});
