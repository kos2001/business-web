"use client";

import Link from "next/link";
import type { ActionItem, ActionStatus } from "@/lib/actions";

/**
 * One action item, wherever it is listed.
 *
 * This markup existed twice — once in the global dashboard, once in the domain
 * one — at about eighty lines each, already differing in small ways. Two copies
 * of a row that carries a checkbox, a status machine and an overdue rule is two
 * places for the overdue rule to be got wrong.
 */

export const STATUS_LABEL: Record<ActionStatus, string> = {
  open: "대기",
  in_progress: "진행 중",
  done: "완료",
  dropped: "취소",
};

/** Clicking the box advances; a dropped item returns to the start. */
export const NEXT_STATUS: Record<ActionStatus, ActionStatus> = {
  open: "in_progress",
  in_progress: "done",
  done: "open",
  dropped: "open",
};

export function isOverdue(item: ActionItem, today = new Date().toISOString().slice(0, 10)) {
  return (
    item.due !== null &&
    item.due < today &&
    (item.status === "open" || item.status === "in_progress")
  );
}

export default function ActionRow({
  item,
  workspaceLabel,
  accent,
  onAdvance,
  onDrop,
}: {
  item: ActionItem;
  workspaceLabel: string;
  /** The domain colour for the left edge, replaced by warn when overdue. */
  accent: string;
  onAdvance: (item: ActionItem, next: ActionStatus) => void;
  onDrop: (item: ActionItem) => void;
}) {
  const overdue = isOverdue(item);
  const closed = item.status === "done" || item.status === "dropped";

  return (
    <li
      className="rounded-xl border bg-surface px-3.5 py-3"
      style={{
        borderColor: overdue ? "var(--color-warn)" : "var(--color-line)",
        borderLeftWidth: 3,
        borderLeftColor: overdue ? "var(--color-warn)" : accent,
      }}
    >
      <div className="flex items-start gap-2.5">
        <button
          onClick={() => onAdvance(item, NEXT_STATUS[item.status])}
          title={`${STATUS_LABEL[item.status]} → ${STATUS_LABEL[NEXT_STATUS[item.status]]}`}
          className={`mt-px flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
            item.status === "done"
              ? "border-accent bg-accent text-white"
              : item.status === "in_progress"
                ? "border-accent"
                : "border-line hover:border-accent"
          }`}
        >
          {item.status === "done" && (
            <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
              <path
                d="M2 6.2 4.6 8.8 10 3.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {item.status === "in_progress" && (
            <span className="size-1.5 rounded-full bg-accent" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className={`text-sm leading-snug ${closed ? "text-ink-soft line-through" : ""}`}>
            {item.title}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-soft">
            <Link
              href={`/w/${item.workspace}`}
              className="hover:text-accent hover:underline"
            >
              {workspaceLabel}
            </Link>
            {/* An absent owner or date is shown, not hidden: the gap is the
                thing to act on, and hiding it makes an item look more settled
                than it is. */}
            {item.owner ? (
              <span>담당 {item.owner}</span>
            ) : (
              <span className="opacity-60">담당 미정</span>
            )}
            {item.due ? (
              <span style={overdue ? { color: "var(--color-warn)" } : undefined}>
                기한 {item.due}
                {overdue && " · 지남"}
              </span>
            ) : (
              <span className="opacity-60">기한 미정</span>
            )}
            <span className="opacity-60">{STATUS_LABEL[item.status]}</span>
          </p>
        </div>

        {!closed && (
          <button
            onClick={() => onDrop(item)}
            title="취소"
            aria-label="취소"
            className="shrink-0 text-xs text-ink-soft/60 hover:text-ink"
          >
            ×
          </button>
        )}
      </div>
    </li>
  );
}
