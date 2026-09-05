"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { STAGE_META } from "@/lib/stage-meta";
import StageIcon from "./StageIcon";
import type { ActionItem, ActionStatus, ActionSummary } from "@/lib/actions";
import type { FocusPoint, WorkspaceRoll } from "@/lib/stage-focus";
import type { Stage } from "@/lib/agents";

/**
 * One work domain, answered in the order the questions actually arrive.
 *
 * Standing in front of 계약 on a Monday nobody asks how many items there are.
 * They ask what is on fire, then what the four workspaces under it are holding,
 * then they want the list. So the page is 집중할 것 → 업무별 현황 → 액션 목록,
 * and the totals are a strip rather than the headline: a count is context for
 * the first question, not an answer to it.
 *
 * Clicking a focus point filters the list to exactly the rows behind it, which
 * is the difference between a finding and an assertion — "기한이 지난 항목
 * 3건" should be three rows you can look at, not a number to be believed.
 */

interface WorkspaceMeta {
  slug: string;
  label: string;
  stage: Stage;
  blurb: string;
}

interface Payload {
  stage: Stage;
  workspaces: string[];
  items: ActionItem[];
  summary: ActionSummary;
  focus: FocusPoint[];
  rollUp: WorkspaceRoll[];
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

const SEVERITY_COLOR: Record<FocusPoint["severity"], string> = {
  urgent: "var(--color-warn)",
  attention: "var(--color-accent)",
  info: "var(--color-line)",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function StageDashboard({
  stage,
  workspaces,
}: {
  stage: Stage;
  workspaces: WorkspaceMeta[];
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  /** Which focus point the list is narrowed to, if any. */
  const [pinned, setPinned] = useState<string | null>(null);
  const meta = STAGE_META[stage];

  const load = useCallback(() => {
    fetch(`/api/stage?stage=${encodeURIComponent(stage)}`)
      .then((r) => r.json())
      .then((d: Payload) => setData(d))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [stage]);

  useEffect(load, [load]);

  async function patch(item: ActionItem, status: ActionStatus) {
    await fetch("/api/actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status }),
    }).catch(() => undefined);
    load();
  }

  const label = (slug: string) => workspaces.find((w) => w.slug === slug)?.label ?? slug;

  const point = data?.focus.find((f) => f.id === pinned) ?? null;
  const shown = (() => {
    if (!data) return [];
    if (!point) return data.items.filter((i) => i.status === "open" || i.status === "in_progress");
    const wanted = new Set(point.itemIds);
    return data.items.filter((i) => wanted.has(i.id));
  })();

  return (
    <main className="page-enter flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-4xl px-6 pb-8 pt-12">
          <nav aria-label="위치" className="flex items-center gap-1.5 text-xs text-ink-soft">
            <Link href="/" className="hover:text-accent hover:underline">
              전체 업무
            </Link>
            <span aria-hidden>/</span>
            <Link href="/dashboard" className="hover:text-accent hover:underline">
              다음 액션
            </Link>
          </nav>

          <div className="mt-2 flex items-center gap-2.5">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl"
              style={{
                color: meta.color,
                backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
              }}
            >
              <StageIcon stage={stage} className="size-[18px]" />
            </span>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{stage}</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{meta.what}</p>

          {data && (
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
              <span>
                <span className="tabular-nums font-medium">{data.summary.open + data.summary.inProgress}</span>
                <span className="ml-1 text-ink-soft">진행할 것</span>
              </span>
              <span style={data.summary.overdue > 0 ? { color: "var(--color-warn)" } : undefined}>
                <span className="tabular-nums font-medium">{data.summary.overdue}</span>
                <span className="ml-1 opacity-80">기한 지남</span>
              </span>
              <span>
                <span className="tabular-nums font-medium">{data.summary.dueThisWeek}</span>
                <span className="ml-1 text-ink-soft">이번 주</span>
              </span>
              <span>
                <span className="tabular-nums font-medium">{data.summary.done}</span>
                <span className="ml-1 text-ink-soft">완료</span>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl px-6 pb-12">
        {loading ? (
          <p className="mt-6 text-sm text-ink-soft">불러오는 중…</p>
        ) : !data ? (
          <p className="mt-6 text-sm text-ink-soft">현황을 불러오지 못했습니다.</p>
        ) : (
          <>
            <section className="mt-8">
              <h2 className="text-[11px] font-semibold tracking-wide text-ink-soft">집중할 것</h2>
              {data.focus.length === 0 ? (
                <p className="mt-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
                  {data.items.length === 0
                    ? "이 업무에서 담은 액션이 아직 없습니다. 워크스페이스에서 답변을 받고 다음 액션을 담으면 여기 모입니다."
                    : "기한 지남·담당 미정 없이 정리돼 있습니다."}
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {data.focus.map((f) => {
                    const on = pinned === f.id;
                    const clickable = f.itemIds.length > 0;
                    return (
                      <li key={f.id}>
                        <button
                          onClick={() => clickable && setPinned(on ? null : f.id)}
                          aria-pressed={on}
                          disabled={!clickable}
                          className={`w-full rounded-xl border bg-surface px-3.5 py-3 text-left transition-colors ${
                            clickable ? "hover:bg-canvas" : "cursor-default"
                          }`}
                          style={{
                            borderColor: on ? SEVERITY_COLOR[f.severity] : "var(--color-line)",
                            borderLeftWidth: 3,
                            borderLeftColor: SEVERITY_COLOR[f.severity],
                          }}
                        >
                          <span className="flex items-baseline gap-2">
                            <span
                              className="text-sm font-medium"
                              style={
                                f.severity === "urgent" ? { color: "var(--color-warn)" } : undefined
                              }
                            >
                              {f.title}
                            </span>
                            {clickable && (
                              <span className="text-[11px] text-ink-soft">
                                {on ? "· 목록 전체 보기" : "· 눌러서 이 항목만 보기"}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                            {f.why}
                          </span>
                          {f.workspaces && (
                            <span className="mt-1.5 flex flex-wrap gap-1.5">
                              {f.workspaces.map((w) => (
                                <Link
                                  key={w}
                                  href={`/w/${w}`}
                                  className="rounded border border-line px-1.5 py-0.5 text-[11px] hover:border-accent hover:text-accent"
                                >
                                  {label(w)}
                                </Link>
                              ))}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="mt-8">
              <h2 className="text-[11px] font-semibold tracking-wide text-ink-soft">업무별 현황</h2>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {data.rollUp.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/w/${r.slug}`}
                      className="flex h-full flex-col rounded-xl border border-line bg-surface px-3.5 py-3 transition-shadow hover:shadow-[0_1px_3px_rgba(18,21,26,0.07)]"
                      style={{ borderLeftWidth: 3, borderLeftColor: meta.color }}
                    >
                      <span className="text-sm font-medium">{label(r.slug)}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[11px] text-ink-soft">
                        {r.total === 0 ? (
                          <span className="opacity-70">담은 액션 없음</span>
                        ) : (
                          <>
                            <span>진행 {r.active}</span>
                            {r.overdue > 0 && (
                              <span style={{ color: "var(--color-warn)" }}>기한 지남 {r.overdue}</span>
                            )}
                            <span>완료 {r.done}</span>
                          </>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-8">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[11px] font-semibold tracking-wide text-ink-soft">
                  액션 아이템
                </h2>
                {point && (
                  <button
                    onClick={() => setPinned(null)}
                    className="text-[11px] text-accent hover:underline"
                  >
                    {point.title} 만 보는 중 · 전체 보기
                  </button>
                )}
              </div>

              {shown.length === 0 ? (
                <p className="mt-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
                  진행할 항목이 없습니다.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {shown.map((item) => {
                    const overdue =
                      item.due !== null &&
                      item.due < today() &&
                      (item.status === "open" || item.status === "in_progress");
                    return (
                      <li
                        key={item.id}
                        className="rounded-xl border bg-surface px-3.5 py-3"
                        style={{
                          borderColor: overdue ? "var(--color-warn)" : "var(--color-line)",
                          borderLeftWidth: 3,
                          borderLeftColor: overdue ? "var(--color-warn)" : meta.color,
                        }}
                      >
                        <div className="flex items-start gap-2.5">
                          <button
                            onClick={() => void patch(item, NEXT_STATUS[item.status])}
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
                                {label(item.workspace)}
                              </Link>
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

                          {item.status !== "dropped" && item.status !== "done" && (
                            <button
                              onClick={() => void patch(item, "dropped")}
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
            </section>
          </>
        )}
      </div>
    </main>
  );
}
