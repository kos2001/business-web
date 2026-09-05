/**
 * What a work domain should be looking at right now.
 *
 * ## The problem with a dashboard that only counts
 *
 * The all-workspace dashboard shows totals and a list. Totals answer "how
 * much", which is the question nobody has. Standing in front of 계약 on a
 * Monday the question is "what do I do first", and four items due in three
 * weeks and one item three days late are the same number.
 *
 * So this derives focus points rather than counts. Each one is a fact about the
 * data with a reason attached, and every reason has to survive the test of
 * being read by someone who disagrees: an item nobody owns will not be done by
 * anyone, an item marked 진행 중 for a fortnight is not in progress. Nothing
 * here is a heuristic score or a health percentage — a number that cannot be
 * traced back to specific rows is a number people learn to ignore.
 *
 * ## Ordering
 *
 * Severity first, then size. Overdue outranks everything because it is the only
 * category already costing something; a domain with no overdue items should see
 * its ownerless ones at the top rather than a green tick, because that is what
 * will be overdue next.
 */

import type { ActionItem } from "./actions";

export type FocusSeverity = "urgent" | "attention" | "info";

export interface FocusPoint {
  id: string;
  severity: FocusSeverity;
  /** Names the fact, with its count. */
  title: string;
  /** Why it is on this list. One line, no hedging. */
  why: string;
  /** The rows behind it, so the list can be filtered to exactly these. */
  itemIds: string[];
  /** Workspaces behind it, where the point is about absence rather than rows. */
  workspaces?: string[];
}

/** Marked 진행 중 but untouched for this long is not in progress. */
const STALL_DAYS = 14;

const SEVERITY_RANK: Record<FocusSeverity, number> = {
  urgent: 0,
  attention: 1,
  info: 2,
};

function isActive(i: ActionItem): boolean {
  return i.status === "open" || i.status === "in_progress";
}

function daysSince(iso: string, now: number): number {
  return Math.floor((now - Date.parse(iso)) / 86_400_000);
}

export interface FocusInput {
  items: ActionItem[];
  /** Every workspace in this domain, including ones with no items. */
  workspaces: readonly string[];
  /** Injectable so the tests are not a function of the day they run. */
  now?: Date;
}

export function focusPoints({ items, workspaces, now = new Date() }: FocusInput): FocusPoint[] {
  const today = now.toISOString().slice(0, 10);
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const active = items.filter(isActive);
  const points: FocusPoint[] = [];

  const overdue = active.filter((i) => i.due !== null && i.due < today);
  if (overdue.length > 0) {
    points.push({
      id: "overdue",
      severity: "urgent",
      title: `기한이 지난 항목 ${overdue.length}건`,
      why: "이 목록에서 이미 비용이 발생하고 있는 유일한 항목입니다.",
      itemIds: overdue.map((i) => i.id),
    });
  }

  const stalled = active.filter(
    (i) => i.status === "in_progress" && daysSince(i.updatedAt, now.getTime()) >= STALL_DAYS,
  );
  if (stalled.length > 0) {
    points.push({
      id: "stalled",
      severity: "attention",
      title: `${STALL_DAYS}일 넘게 멈춘 진행 항목 ${stalled.length}건`,
      why: "진행 중으로 표시된 뒤 상태가 바뀌지 않았습니다. 진행 중이 아닐 가능성이 큽니다.",
      itemIds: stalled.map((i) => i.id),
    });
  }

  const dueSoon = active.filter(
    (i) => i.due !== null && i.due >= today && i.due <= weekEnd,
  );
  if (dueSoon.length > 0) {
    points.push({
      id: "due-soon",
      severity: "attention",
      title: `이번 주 기한 ${dueSoon.length}건`,
      why: "지금 손대지 않으면 다음 주에 기한 지남으로 올라옵니다.",
      itemIds: dueSoon.map((i) => i.id),
    });
  }

  const ownerless = active.filter((i) => i.owner === null);
  if (ownerless.length > 0) {
    points.push({
      id: "ownerless",
      severity: "attention",
      title: `담당이 없는 항목 ${ownerless.length}건`,
      why: "담당이 정해지지 않은 일은 아무도 하지 않습니다. 이름을 붙이는 것이 첫 조치입니다.",
      itemIds: ownerless.map((i) => i.id),
    });
  }

  const undated = active.filter((i) => i.due === null);
  if (undated.length > 0) {
    points.push({
      id: "undated",
      severity: "info",
      title: `기한이 없는 항목 ${undated.length}건`,
      why: "기한이 없으면 밀려도 아무 신호가 나지 않습니다.",
      itemIds: undated.map((i) => i.id),
    });
  }

  const touched = new Set(items.map((i) => i.workspace));
  const untouched = workspaces.filter((w) => !touched.has(w));
  if (untouched.length > 0 && untouched.length < workspaces.length) {
    // Only when *part* of the domain is unused. If nothing in it has been used
    // at all, that is the empty state's job to say, not a finding.
    points.push({
      id: "untouched",
      severity: "info",
      title: `아직 담은 액션이 없는 업무 ${untouched.length}곳`,
      why: "쓰이지 않았거나, 답변의 다음 액션을 담지 않고 넘긴 것입니다.",
      itemIds: [],
      workspaces: untouched,
    });
  }

  return points.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.itemIds.length - a.itemIds.length,
  );
}

export interface WorkspaceRoll {
  slug: string;
  total: number;
  active: number;
  overdue: number;
  done: number;
}

/** Per-workspace counts, in the domain's own order, including empty ones. */
export function rollUpByWorkspace(
  items: ActionItem[],
  workspaces: readonly string[],
  now = new Date(),
): WorkspaceRoll[] {
  const today = now.toISOString().slice(0, 10);
  return workspaces.map((slug) => {
    const mine = items.filter((i) => i.workspace === slug);
    return {
      slug,
      total: mine.length,
      active: mine.filter(isActive).length,
      overdue: mine.filter((i) => isActive(i) && i.due !== null && i.due < today).length,
      done: mine.filter((i) => i.status === "done").length,
    };
  });
}
