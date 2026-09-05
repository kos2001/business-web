"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { STAGE_META } from "@/lib/stage-meta";
import { STAGES } from "@/lib/agents";
import PageHeader from "./PageHeader";
import { StatRow } from "./Stats";
import ActionRow from "./ActionRow";
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

  async function patch(item: ActionItem, status: ActionStatus) {
    await fetch("/api/actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status }),
    }).catch(() => undefined);
    load();
  }

  const wsLabel = (slug: string) =>
    workspaces.find((w) => w.slug === slug)?.label ?? slug;
  const wsStage = (slug: string) => workspaces.find((w) => w.slug === slug)?.stage;

  return (
    <main className="page-enter flex min-w-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        eyebrow="영업 에이전트"
        title="지금 무엇이 밀려 있나"
        lead="워크스페이스에서 담은 다음 액션이 여기 모입니다. 기한이 지난 것이 맨 위에 옵니다."
      >
        {summary && (
          <StatRow
            stats={[
              { label: "기한 지남", value: summary.overdue, tone: "urgent" },
              { label: "이번 주", value: summary.dueThisWeek },
              { label: "진행 중", value: summary.inProgress },
              { label: "완료", value: summary.done },
            ]}
          />
        )}
      </PageHeader>

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

        {/* Per-domain dashboards. This page answers "everything outstanding",
            which is the right first question and the wrong second one: acting
            on 계약 means seeing 계약 alone, with its own workspaces and its own
            idea of what is urgent. The counts here are the domains that have
            something in them, so the row does not read as seven empty links. */}
        {summary && (
          <nav aria-label="업무별 현황" className="mt-3 flex flex-wrap gap-1.5">
            {STAGES.map((stage) => {
              const n = Object.entries(summary.byWorkspace)
                .filter(([slug]) => workspaces.find((w) => w.slug === slug)?.stage === stage)
                .reduce((acc, [, count]) => acc + count, 0);
              return (
                <Link
                  key={stage}
                  href={`/dashboard/${encodeURIComponent(stage)}`}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs transition-colors hover:border-accent"
                  style={{ borderLeftWidth: 3, borderLeftColor: STAGE_META[stage].color }}
                >
                  {stage}
                  <span className={`tabular-nums ${n > 0 ? "font-medium" : "text-ink-soft/60"}`}>
                    {n}
                  </span>
                </Link>
              );
            })}
          </nav>
        )}

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
            {items.map((item) => (
              <ActionRow
                key={item.id}
                item={item}
                workspaceLabel={wsLabel(item.workspace)}
                accent={
                  wsStage(item.workspace)
                    ? STAGE_META[wsStage(item.workspace)!].color
                    : "var(--color-line)"
                }
                onAdvance={(i, next) => void patch(i, next)}
                onDrop={(i) => void patch(i, "dropped")}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
