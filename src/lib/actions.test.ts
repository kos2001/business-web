import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB = join(tmpdir(), `actions-test-${process.pid}.db`);
process.env.ACTIONS_DB_PATH = DB;

const {
  createAction, listActions, updateAction, deleteAction, summarise, _resetForTests,
} = await import("./actions");

const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => _resetForTests());
afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
});

describe("createAction", () => {
  it("stores an item and starts it open", () => {
    const a = createAction({ title: "예산 확인", workspace: "discovery" });
    expect(a.status).toBe("open");
    expect(a.title).toBe("예산 확인");
    expect(listActions()).toHaveLength(1);
  });

  it("keeps owner and due null when the source never named them", () => {
    // Not inventing an owner is the playbooks' core discipline. A store that
    // demanded one would force the agent to break it.
    const a = createAction({ title: "법무 검토 요청", workspace: "contract" });
    expect(a.owner).toBeNull();
    expect(a.due).toBeNull();
  });

  it("treats blank strings as absent, not as a value", () => {
    const a = createAction({ title: "x", workspace: "w", owner: "  ", due: "" });
    expect(a.owner).toBeNull();
    expect(a.due).toBeNull();
  });
});

describe("listActions", () => {
  it("floats overdue items to the top", () => {
    // What is late is the only thing on the list already costing something.
    createAction({ title: "최근", workspace: "w" });
    createAction({ title: "기한 지남", workspace: "w", due: iso(-3) });
    expect(listActions()[0].title).toBe("기한 지남");
  });

  it("does not float a done item even when its due date passed", () => {
    createAction({ title: "완료됨", workspace: "w", due: iso(-5) });
    const done = listActions()[0];
    updateAction(done.id, { status: "done" });
    createAction({ title: "새 항목", workspace: "w" });
    expect(listActions()[0].title).toBe("새 항목");
  });

  it("filters by status and by workspace", () => {
    const a = createAction({ title: "a", workspace: "contract" });
    createAction({ title: "b", workspace: "pipeline" });
    updateAction(a.id, { status: "done" });

    expect(listActions({ status: "done" })).toHaveLength(1);
    expect(listActions({ status: "active" })).toHaveLength(1);
    expect(listActions({ workspace: "pipeline" })).toHaveLength(1);
  });

  it("'active' covers open and in_progress together", () => {
    const a = createAction({ title: "a", workspace: "w" });
    createAction({ title: "b", workspace: "w" });
    updateAction(a.id, { status: "in_progress" });
    expect(listActions({ status: "active" })).toHaveLength(2);
  });
});

describe("updateAction", () => {
  it("moves an item through its lifecycle", () => {
    const a = createAction({ title: "협상 준비", workspace: "contract-plan" });
    expect(updateAction(a.id, { status: "in_progress" })?.status).toBe("in_progress");
    expect(updateAction(a.id, { status: "done" })?.status).toBe("done");
  });

  it("records why something was dropped", () => {
    const a = createAction({ title: "불필요해진 일", workspace: "w" });
    const d = updateAction(a.id, { status: "dropped", note: "고객이 요구를 철회함" });
    expect(d?.note).toBe("고객이 요구를 철회함");
  });

  it("can fill in an owner that was unknown at creation", () => {
    const a = createAction({ title: "x", workspace: "w" });
    expect(updateAction(a.id, { owner: "김대리" })?.owner).toBe("김대리");
  });

  it("returns null for an id that does not exist", () => {
    expect(updateAction("nope", { status: "done" })).toBeNull();
  });
});

describe("deleteAction", () => {
  it("removes an item and reports whether it did", () => {
    const a = createAction({ title: "x", workspace: "w" });
    expect(deleteAction(a.id)).toBe(true);
    expect(deleteAction(a.id)).toBe(false);
    expect(listActions()).toHaveLength(0);
  });
});

describe("summarise", () => {
  it("counts overdue separately from open", () => {
    createAction({ title: "늦음", workspace: "w", due: iso(-2) });
    createAction({ title: "여유", workspace: "w", due: iso(30) });
    const s = summarise();
    expect(s.open).toBe(2);
    expect(s.overdue).toBe(1);
  });

  it("counts what is due within a week", () => {
    createAction({ title: "이번 주", workspace: "w", due: iso(3) });
    createAction({ title: "다음 달", workspace: "w", due: iso(40) });
    expect(summarise().dueThisWeek).toBe(1);
  });

  it("counts only active items per workspace", () => {
    // A dashboard tile showing closed work as load would misdirect attention.
    const a = createAction({ title: "a", workspace: "contract" });
    createAction({ title: "b", workspace: "contract" });
    updateAction(a.id, { status: "done" });
    expect(summarise().byWorkspace).toEqual({ contract: 1 });
  });

  it("is all zeroes on an empty store", () => {
    const s = summarise();
    expect(s.total).toBe(0);
    expect(s.overdue).toBe(0);
    expect(s.byWorkspace).toEqual({});
  });
});
