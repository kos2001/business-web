"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "./PageHeader";
import { StatRow } from "./Stats";
import FindingCard from "./FindingCard";
import type { Defect, DefectPattern, DefectSummary } from "@/lib/defects";

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

/**
 * Which tile is open.
 *
 * The page used to show only what had recurred, with the other counts as
 * decoration above it — "전체 발견 14" sitting over an empty list, because none
 * of the fourteen had reached three yet. Those fourteen are the material the
 * page exists to hand over, so every tile opens onto the findings behind it.
 */
type Focus = "recurring" | "all" | "spelling" | "figures";

const FIGURE_KINDS = new Set(["number", "misquote"]);

const FOCUS_CAPTION: Record<Focus, string> = {
  recurring: "세 번 이상 되풀이된 것 — 규칙으로 고칠 거리입니다.",
  all: "검수가 잡은 전부입니다. 같은 결함은 하나로 묶었고, 옆의 횟수가 묶인 개수입니다.",
  spelling: "맞춤법으로 분류된 것입니다.",
  figures: "수치와 인용 — 틀리면 그대로 협상에 나가는 종류입니다.",
};

function matches(focus: Focus, p: DefectPattern): boolean {
  if (focus === "all") return true;
  if (focus === "recurring") return p.count >= 3;
  if (focus === "spelling") return p.kind === "spelling";
  return FIGURE_KINDS.has(p.kind);
}

function when(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "오늘";
  return `${days}일 전`;
}

export default function Improvement() {
  const [days, setDays] = useState<number>(30);
  const [patterns, setPatterns] = useState<DefectPattern[]>([]);
  const [groups, setGroups] = useState<DefectPattern[]>([]);
  const [summary, setSummary] = useState<DefectSummary | null>(null);
  const [focus, setFocus] = useState<Focus>("recurring");
  /** Which card is expanded, and the records fetched for it. */
  const [open, setOpen] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, Defect[] | "loading" | "error">>({});

  const expand = useCallback(
    (key: string) => {
      setOpen((cur) => (cur === key ? null : key));
      setRecords((cur) => {
        if (cur[key] && cur[key] !== "error") return cur;
        fetch(`/api/defects?days=${days}&key=${encodeURIComponent(key)}`)
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((d: { occurrences: Defect[] }) =>
            setRecords((c) => ({ ...c, [key]: d.occurrences })),
          )
          // Saying so beats an empty panel that reads as "nothing to see".
          .catch(() => setRecords((c) => ({ ...c, [key]: "error" })));
        return { ...cur, [key]: "loading" };
      });
    },
    [days],
  );
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(() => {
    setState("loading");
    fetch(`/api/defects?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(
        (d: {
          patterns: DefectPattern[];
          groups?: DefectPattern[];
          summary: DefectSummary;
        }) => {
          setPatterns(d.patterns);
          setGroups(d.groups ?? d.patterns);
          setSummary(d.summary);
          setState("ready");
        },
      )
      .catch(() => setState("error"));
  }, [days]);

  useEffect(load, [load]);
  // The window bounds the records too, so a panel opened under "최근 90일" must
  // not stay open showing those rows after switching to "최근 7일".
  useEffect(() => {
    setOpen(null);
    setRecords({});
  }, [days]);

  // Recurring keeps its own server-side list so the threshold lives in one
  // place; every other tile filters the unthresholded groups.
  const visible = focus === "recurring" ? patterns : groups.filter((g) => matches(focus, g));

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
              {
                label: "반복 패턴",
                value: summary.recurring,
                tone: "urgent",
                selected: focus === "recurring",
                onSelect: () => setFocus("recurring"),
              },
              {
                label: "전체 발견",
                value: summary.total,
                selected: focus === "all",
                onSelect: () => setFocus("all"),
              },
              {
                label: "맞춤법",
                value: summary.byKind.spelling ?? 0,
                selected: focus === "spelling",
                onSelect: () => setFocus("spelling"),
              },
              {
                label: "수치·인용",
                value: (summary.byKind.number ?? 0) + (summary.byKind.misquote ?? 0),
                selected: focus === "figures",
                onSelect: () => setFocus("figures"),
              },
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
        ) : visible.length === 0 ? (
          /* "반복이 없다"와 "아무것도 기록되지 않았다"는 화면에서 같아 보이지만
             전혀 다른 상황이다. 전자는 정상이고, 후자는 검수가 기록까지
             도달하지 않는다는 뜻 — 실제로 테스트가 이 저장소를 매번 비우고
             있었고, 그동안 이 화면은 조용히 "문제 없음"처럼 보였다. */
          <div
            className="mt-4 rounded-xl border bg-surface px-4 py-8 text-center"
            style={{
              borderColor:
                summary && summary.total === 0 ? "var(--color-warn)" : "var(--color-line)",
            }}
          >
            {summary && summary.total === 0 ? (
              <>
                <p className="text-sm" style={{ color: "var(--color-warn)" }}>
                  최근 {days}일 동안 기록된 결함이 하나도 없습니다.
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                  답변을 몇 번 받았다면 맞춤법이든 수치든 무언가는 잡혔어야 합니다.
                  아무것도 없다는 것은 검수 결과가 저장소까지 도달하지 않는다는
                  뜻일 수 있습니다 — 워크스페이스에서 답변을 하나 받아 보고도
                  비어 있으면 기록 경로를 확인해야 합니다.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm">
                  {focus === "recurring"
                    ? `최근 ${days}일 동안 세 번 이상 되풀이된 결함이 없습니다.`
                    : "이 분류에 해당하는 것이 없습니다."}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                  검수는 {summary?.total ?? 0}건을 잡았습니다. 한두 번은 답변에서
                  고치고, 반복되면 규칙으로 고칩니다.
                </p>
                {focus !== "all" && (summary?.total ?? 0) > 0 && (
                  /* 반복이 없다고 해서 볼 것이 없는 것은 아니다. 반복은 세 번째
                     발생에서 시작하므로, 두 번 나온 것이 다음 패턴이다. */
                  <button
                    onClick={() => setFocus("all")}
                    className="mt-3 rounded-md border border-line px-2.5 py-1 text-xs hover:border-accent hover:text-accent"
                  >
                    잡힌 {summary?.total ?? 0}건 전부 보기
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">
              {FOCUS_CAPTION[focus]}
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {visible.map((p) => {
                const rows = records[p.key];
                // A single occurrence has nothing behind it: the card already
                // shows that record's quote, reason, workspace and date, so
                // opening it repeats the card. Offering the click anyway was
                // an invitation to find out there is nothing there.
                const expandable = p.count > 1;
                return (
                  <FindingCard
                    key={p.key}
                    severity={p.count >= 5 ? "urgent" : p.count >= 3 ? "attention" : "info"}
                    title={`${KIND_LABEL[p.kind] ?? p.kind} · ${p.count}회`}
                    why={p.reason}
                    active={open === p.key}
                    onClick={expandable ? () => expand(p.key) : undefined}
                    hint={
                      // The spread is the finding. One workspace means the
                      // playbook; several mean the shared SOUL, and a rule in
                      // one playbook would fix a fraction of it.
                      p.count < 3
                        ? "· 아직 반복 아님 — 한 번 더 나오면 규칙 거리입니다"
                        : p.scope === "profile"
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
                      {expandable && (
                        <span className="opacity-70">
                          {open === p.key
                            ? "· 접기"
                            : `· 눌러서 ${p.count}건의 실제 표현 보기`}
                        </span>
                      )}
                    </span>

                    {expandable && open === p.key && (
                      /* 묶는 과정에서 대표 인용 하나만 남고 나머지는 버려진다.
                         규칙을 쓰려면 버려진 쪽이 필요하다 — 배상율 은
                         지연배상율·배상율 인하·연체 배상율 에서 묶인 것이고,
                         그중 하나만 보고 쓴 규칙은 습관보다 좁다. */
                      <span className="mt-2 block rounded-lg border border-line bg-canvas px-2.5 py-2">
                        {rows === "loading" ? (
                          <span className="block text-[11px] text-ink-soft">
                            기록을 읽는 중…
                          </span>
                        ) : rows === "error" || rows === undefined ? (
                          <span className="block text-[11px] text-ink-soft">
                            이 패턴의 기록을 읽지 못했습니다.
                          </span>
                        ) : (
                          <>
                            <span className="block text-[11px] font-medium">
                              실제로 이렇게 나왔습니다 · {rows.length}건
                            </span>
                            <span className="mt-1.5 flex flex-col gap-1.5">
                              {rows.map((d) => (
                                <span key={d.id} className="block">
                                  <span className="block break-words font-mono text-[11px]">
                                    {d.quote}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-soft">
                                    {d.reason}
                                  </span>
                                  <span className="mt-0.5 block text-[10px] text-ink-soft opacity-70">
                                    {d.workspace} · {when(d.at)}
                                  </span>
                                </span>
                              ))}
                            </span>
                          </>
                        )}
                      </span>
                    )}
                  </FindingCard>
                );
              })}
            </ul>
          </>
        )}

        <p className="mt-6 text-[11px] leading-relaxed text-ink-soft">
          규칙은 사람이 씁니다. 자기 출력을 근거로 자기 지시를 고치는 시스템은 양쪽 모두에
          바깥의 확인이 없어, 아무도 고른 적 없는 방향으로 프롬프트가 흘러갑니다.
        </p>
      </div>
    </main>
  );
}
