"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { STAGE_META } from "@/lib/stage-meta";
import PageHeader from "./PageHeader";
import { StatRow, SplitBar } from "./Stats";
import FindingCard from "./FindingCard";
import ActionRow from "./ActionRow";
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
      <PageHeader
        title={stage}
        lead={meta.what}
        stage={stage}
        crumbs={[
          { label: "전체 업무", href: "/" },
          { label: "다음 액션", href: "/dashboard" },
        ]}
      >
        {data && (
          <StatRow
            stats={[
              { label: "기한 지남", value: data.summary.overdue, tone: "urgent" },
              { label: "이번 주", value: data.summary.dueThisWeek },
              { label: "진행 중", value: data.summary.inProgress },
              { label: "완료", value: data.summary.done },
            ]}
          />
        )}
      </PageHeader>

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
                    const clickable = f.itemIds.length > 0;
                    return (
                      <FindingCard
                        key={f.id}
                        severity={f.severity}
                        title={f.title}
                        why={f.why}
                        active={pinned === f.id}
                        hint={
                          clickable
                            ? pinned === f.id
                              ? "· 목록 전체 보기"
                              : "· 눌러서 이 항목만 보기"
                            : undefined
                        }
                        onClick={
                          clickable
                            ? () => setPinned(pinned === f.id ? null : f.id)
                            : undefined
                        }
                      >
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
                      </FindingCard>
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
                      {/* Three numbers make the reader work out whether this
                          workspace is mostly finished or mostly stuck. The bar
                          answers that before it is read, and carries nothing
                          the numbers above it do not. */}
                      <SplitBar
                        total={r.total}
                        segments={[
                          { label: "기한 지남", value: r.overdue, color: "var(--color-warn)" },
                          {
                            label: "진행",
                            value: r.active - r.overdue,
                            color: meta.color,
                          },
                          {
                            label: "완료",
                            value: r.done,
                            color: `color-mix(in srgb, ${meta.color} 30%, transparent)`,
                          },
                        ]}
                      />
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
                  {shown.map((item) => (
                    <ActionRow
                      key={item.id}
                      item={item}
                      workspaceLabel={label(item.workspace)}
                      accent={meta.color}
                      onAdvance={(i, next) => void patch(i, next)}
                      onDrop={(i) => void patch(i, "dropped")}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
