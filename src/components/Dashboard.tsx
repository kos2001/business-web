"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { STAGE_META } from "@/lib/stage-meta";
import type { ActionItem, ActionStatus, ActionSummary } from "@/lib/actions";
import type { Stage } from "@/lib/agents";

/**
 * One screen for "what is actually outstanding".
 *
 * The 25 workspaces each produce follow-ups and then forget them. This is where
 * they are answerable. The ordering is the argument: overdue first, because it
 * is the only thing on the page already costing something; everything else is
 * context for it.
 */

interface WorkspaceMeta {
  slug: string;
  label: string;
  stage: Stage;
}

const STATUS_LABEL: Record<ActionStatus, string> = {
  open: "대기",
  in_progress: "진행 중",
  done: "완료",
  dropped: "취소",
};

const NEXT_STATUS: Record<ActionStatus, ActionStatus> = {
  open: "in_progress",
  in_progress: "done",
  done: "open",
  dropped: "open",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "urgent" | "normal";
}) {
  return (
    <div
      className="rounded-xl border bg-surface px-3.5 py-3"
      style={
        tone === "urgent" && value > 0
          ? { borderColor: "var(--color-warn)", borderLeftWidth: 3 }
          : { borderColor: "var(--color-line)" }
      }
    >
      <div
        className="text-2xl font-semibold tabular-nums leading-none"
        style={tone === "urgent" && value > 0 ? { color: "var(--color-warn)" } : undefined}
      >
        {value}
      </div>
      <div className="mt-1.5 text-xs text-ink-soft">{label}</div>
    </div>
  );
}

export default function Dashboard({ workspaces }: { workspaces: WorkspaceMeta[] }) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [summary, setSummary] = useState<ActionSummary | null>(null);
  const [filter, setFilter] = useState<"active" | "done" | "all">("active");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const q = filter === "all" ? "" : `?status=${filter}`;
    fetch(`/api/actions${q}`)
      .then((r) => r.json())
      .then((d: { items: ActionItem[]; summary: ActionSummary }) => {
        setItems(d.items);
        setSummary(d.summary);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(load, [load]);

  async function advance(item: ActionItem) {
    await fetch("/api/actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status: NEXT_STATUS[item.status] }),
    }).catch(() => undefined);
    load();
  }

  async function drop(item: ActionItem) {
    await fetch("/api/actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status: "dropped" }),
    }).catch(() => undefined);
    load();
  }

  const wsLabel = (slug: string) =>
    workspaces.find((w) => w.slug === slug)?.label ?? slug;
  const wsStage = (slug: string) => workspaces.find((w) => w.slug === slug)?.stage;

  return (
    <main className="page-enter flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-4xl px-6 pb-8 pt-12">
          <p className="text-xs font-medium tracking-wide text-ink-soft/70">영업 에이전트</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight">
            지금 무엇이 밀려 있나
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            워크스페이스에서 담은 다음 액션이 여기 모입니다. 기한이 지난 것이 맨
            위에 옵니다.
          </p>

          {summary && (
            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Tile label="기한 지남" value={summary.overdue} tone="urgent" />
              <Tile label="이번 주" value={summary.dueThisWeek} />
              <Tile label="진행 중" value={summary.inProgress} />
              <Tile label="완료" value={summary.done} />
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl px-6 pb-12">
        <div className="mt-6 flex items-center gap-1.5">
          {(["active", "done", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                filter === f
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-ink-soft hover:bg-canvas"
              }`}
            >
              {f === "active" ? "진행" : f === "done" ? "완료" : "전체"}
            </button>
          ))}
          <span className="flex-1" />
          <Link href="/" className="text-xs text-ink-soft hover:text-accent hover:underline">
            워크스페이스로 →
          </Link>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-ink-soft">불러오는 중…</p>
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-xl border border-line bg-surface px-4 py-8 text-center">
            <p className="text-sm">담긴 액션이 없습니다.</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
              워크스페이스에서 답변을 받으면 끝에 &lsquo;다음 액션&rsquo;이 제안됩니다.
              담을 것만 고르면 여기 모입니다.
            </p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {items.map((item) => {
              const overdue =
                item.due !== null &&
                item.due < today() &&
                (item.status === "open" || item.status === "in_progress");
              const stage = wsStage(item.workspace);
              return (
                <li
                  key={item.id}
                  className="rounded-xl border bg-surface px-3.5 py-3"
                  style={{
                    borderColor: overdue ? "var(--color-warn)" : "var(--color-line)",
                    borderLeftWidth: 3,
                    borderLeftColor: overdue
                      ? "var(--color-warn)"
                      : stage
                        ? STAGE_META[stage].color
                        : "var(--color-line)",
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      onClick={() => void advance(item)}
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
                      <p
                        className={`text-sm leading-snug ${
                          item.status === "done" || item.status === "dropped"
                            ? "text-ink-soft line-through"
                            : ""
                        }`}
                      >
                        {item.title}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-soft">
                        <Link
                          href={`/w/${item.workspace}`}
                          className="hover:text-accent hover:underline"
                        >
                          {wsLabel(item.workspace)}
                        </Link>
                        {item.owner && <span>담당 {item.owner}</span>}
                        {item.due && (
                          <span style={overdue ? { color: "var(--color-warn)" } : undefined}>
                            기한 {item.due}
                            {overdue && " · 지남"}
                          </span>
                        )}
                        {/* Absent owner or due is shown, not hidden: the gap is
                            the thing to act on, and hiding it makes an item
                            look more settled than it is. */}
                        {!item.owner && <span className="opacity-60">담당 미정</span>}
                        {!item.due && <span className="opacity-60">기한 미정</span>}
                        <span className="opacity-60">{STATUS_LABEL[item.status]}</span>
                      </p>
                    </div>

                    {item.status !== "dropped" && item.status !== "done" && (
                      <button
                        onClick={() => void drop(item)}
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
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
