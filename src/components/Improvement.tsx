"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "./PageHeader";
import { StatRow } from "./Stats";
import FindingCard from "./FindingCard";
import type { DefectPattern, DefectSummary } from "@/lib/defects";

/**
 * The half of the improvement loop a machine can do.
 *
 * The checks under each answer find defects and forget them. Someone reading
 * one warning cannot tell whether it is bad luck or a habit, and that is the
 * only distinction that decides what to do: bad luck you fix in the answer, a
 * habit you fix in the instructions.
 *
 * This page holds the memory. It shows what has recurred, how often, and — the
 * part that is actually hard to see by hand — how widely. A defect in one
 * workspace is that playbook's problem. The same defect in five is the shared
 * profile's, and a rule written into one playbook would fix a fifth of it.
 *
 * It stops there. Writing the rule is a person's job: a system that edits its
 * own instructions from its own output has no outside check on either half.
 */

const KIND_LABEL: Record<string, string> = {
  spelling: "맞춤법",
  "broken-context": "문맥 끊김",
  "table-misread": "표 오독",
  number: "수치",
  repetition: "반복 손상",
  "foreign-script": "다른 문자",
  misquote: "인용 오류",
};

const WINDOWS = [7, 30, 90] as const;

function when(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "오늘";
  return `${days}일 전`;
}

export default function Improvement() {
  const [days, setDays] = useState<number>(30);
  const [patterns, setPatterns] = useState<DefectPattern[]>([]);
  const [summary, setSummary] = useState<DefectSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(() => {
    setState("loading");
    fetch(`/api/defects?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { patterns: DefectPattern[]; summary: DefectSummary }) => {
        setPatterns(d.patterns);
        setSummary(d.summary);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [days]);

  useEffect(load, [load]);

  return (
    <main className="page-enter flex min-w-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        title="반복되는 결함"
        lead="답변 검수가 찾은 것을 모아 둡니다. 한 번은 운이고, 여러 번은 지시의 문제입니다 — 여기 올라온 것은 플레이북이나 SOUL 을 고칠 거리입니다."
        crumbs={[{ label: "전체 업무", href: "/" }]}
      >
        {summary && (
          <StatRow
            stats={[
              { label: "반복 패턴", value: summary.recurring, tone: "urgent" },
              { label: "전체 발견", value: summary.total },
              { label: "맞춤법", value: summary.byKind.spelling ?? 0 },
              { label: "수치·인용", value: (summary.byKind.number ?? 0) + (summary.byKind.misquote ?? 0) },
            ]}
          />
        )}
      </PageHeader>

      <div className="mx-auto w-full max-w-4xl px-6 pb-12">
        <div className="mt-6 flex items-center gap-1.5">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setDays(w)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                days === w
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-ink-soft hover:bg-canvas"
              }`}
            >
              최근 {w}일
            </button>
          ))}
        </div>

        {state === "loading" ? (
          <p className="mt-6 text-sm text-ink-soft">불러오는 중…</p>
        ) : state === "error" ? (
          <p className="mt-6 text-sm text-ink-soft">
            결함 기록을 읽지 못했습니다. 아직 아무것도 기록되지 않았을 수 있습니다.
          </p>
        ) : patterns.length === 0 ? (
          <div className="mt-6 rounded-xl border border-line bg-surface px-4 py-8 text-center">
            <p className="text-sm">최근 {days}일 동안 반복된 결함이 없습니다.</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
              같은 문제가 세 번 나타나면 여기 올라옵니다. 한두 번은 답변에서 고치고,
              반복되면 규칙으로 고칩니다.
            </p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {patterns.map((p) => (
              <FindingCard
                key={p.key}
                severity={p.count >= 5 ? "urgent" : "attention"}
                title={`${KIND_LABEL[p.kind] ?? p.kind} · ${p.count}회`}
                why={p.reason}
                hint={
                  // The spread is the finding. One workspace means the playbook;
                  // several mean the shared SOUL, and a rule in one playbook
                  // would fix a fraction of it.
                  p.scope === "profile"
                    ? `· ${p.workspaces.length}개 워크스페이스 — SOUL 에 규칙을 넣을 것`
                    : "· 한 워크스페이스 — 해당 플레이북에 규칙을 넣을 것"
                }
              >
                <span className="mt-1.5 block break-words rounded bg-canvas px-2 py-1 font-mono text-[11px]">
                  {p.quote}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-soft">
                  {p.workspaces.map((w) => (
                    <Link
                      key={w}
                      href={`/w/${w}`}
                      className="rounded border border-line px-1.5 py-0.5 hover:border-accent hover:text-accent"
                    >
                      {w}
                    </Link>
                  ))}
                  <span className="opacity-70">
                    {when(p.firstAt)} 처음 · {when(p.lastAt)} 마지막
                  </span>
                </span>
              </FindingCard>
            ))}
          </ul>
        )}

        <p className="mt-6 text-[11px] leading-relaxed text-ink-soft">
          규칙은 사람이 씁니다. 자기 출력을 근거로 자기 지시를 고치는 시스템은 양쪽 모두에
          바깥의 확인이 없어, 아무도 고른 적 없는 방향으로 프롬프트가 흘러갑니다.
        </p>
      </div>
    </main>
  );
}
