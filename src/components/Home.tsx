"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { STAGES, type Stage } from "@/lib/agents";
import { STAGE_META } from "@/lib/stage-meta";
import StageIcon from "./StageIcon";
import Sidebar, { type HealthMap, type NavItem } from "./Sidebar";
import { readRecents } from "@/lib/recents";

export interface HomeAgent {
  slug: string;
  label: string;
  blurb: string;
  stage: Stage;
  starters: string[];
  /** Searched but not displayed — the vocabulary of the underlying playbook. */
  playbooks: readonly string[];
}

/**
 * The home board.
 *
 * The first version of this read as a brochure: a bare document of uniform
 * cards, outside the app's own chrome, with nothing on it that did anything.
 * Three things make it a place you work from instead.
 *
 * **It is inside the app.** The same sidebar as every workspace, so home is a
 * surface of the product rather than a page in front of it.
 *
 * **The search actually routes.** You describe the job in your own words and it
 * finds the workspace, matching against each one's label, description, example
 * questions and — invisibly — its playbook names, so "EOL" or "MEDDIC" lands
 * even though neither word appears on a card. Enter carries your text into the
 * workspace as a ready-made first message; nothing is retyped.
 *
 * **It remembers you.** People settle into two or three workspaces, so the ones
 * you actually use are pinned to the top after the first visit.
 */
export default function Home({ agents }: { agents: HomeAgent[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthMap>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // The workspace breadcrumb links back with ?stage=<domain>. Coming back to a
  // 23-card board and having to find where you were is the moment the "page"
  // illusion breaks, so the board scrolls to that domain and marks it.
  const params = useSearchParams();
  const fromStage = params.get("stage");

  useEffect(() => setRecents(readRecents()), []);

  useEffect(() => {
    if (!fromStage) return;
    const el = document.getElementById(`stage-${fromStage}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [fromStage]);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then(
        (b: {
          agents?: {
            slug: string;
            status: string;
            missingPlaybooks?: string[];
          }[];
        }) =>
          setHealth(
            Object.fromEntries(
              (b.agents ?? []).map((a) => [
                a.slug,
                // A workspace whose backend answers but whose playbooks are not
                // installed is not healthy — the agent quietly answers from its
                // persona instead. Folding that into one status keeps the nav
                // honest without adding a second indicator to every row.
                a.status === "ok" && a.missingPlaybooks?.length
                  ? { state: "degraded" as const, missing: a.missingPlaybooks }
                  : { state: a.status },
              ]),
            ),
          ),
      )
      .catch(() => undefined);
  }, []);

  const nav: NavItem[] = agents.map((a) => ({
    slug: a.slug,
    label: a.label,
    stage: a.stage,
  }));

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return agents.filter((a) =>
      [a.label, a.blurb, ...a.starters, ...a.playbooks]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [q, agents]);

  /** Carry what the user typed into the workspace as its opening message. */
  function open(slug: string) {
    const text = q.trim();
    router.push(text ? `/w/${slug}?q=${encodeURIComponent(text)}` : `/w/${slug}`);
  }

  const recentAgents = recents
    .map((s) => agents.find((a) => a.slug === s))
    .filter((a): a is HomeAgent => Boolean(a))
    .slice(0, 4);

  const down = agents.filter((a) => health[a.slug]?.state === "down");
  // Degraded is called out separately: the backend is up, so "점검 필요" would
  // send someone looking in the wrong place. What is actually wrong is that the
  // playbooks are not installed.
  const degraded = agents.filter((a) => health[a.slug]?.state === "degraded");

  return (
    <div className="flex h-dvh">
      <Sidebar nav={nav} health={health} recents={recents} />

      <main className="page-enter flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* A banded hero. The home board and a workspace previously shared the
            same chrome, background and layout, so opening a card read as a tab
            changing rather than a page opening. Giving the landing page a
            surface of its own is half of what makes the other feel like a
            destination. */}
        <div className="border-b border-line bg-surface">
          <div className="mx-auto w-full max-w-4xl px-6 pb-8 pt-12">
            <p className="text-xs font-medium tracking-wide text-ink-soft/70">
              영업 에이전트
            </p>
            <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight">
              무엇을 도와드릴까요?
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
              하려는 일을 그대로 적어 보세요. 맞는 워크스페이스로 안내하고, 적은
              내용은 첫 메시지로 그대로 넘어갑니다.
            </p>

          <div className="relative mt-4">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft/60"
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-4">
                <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="m13.5 13.5 3 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches.length > 0) open(matches[0].slug);
                if (e.key === "Escape") setQ("");
              }}
              placeholder="예) 단종 통지 받았는데 영향 고객 정리해 줘"
              aria-label="하려는 일 검색"
              className="w-full rounded-xl border border-line bg-surface py-3 pl-10 pr-16 text-sm outline-none transition-colors focus:border-accent"
            />
            {/* Enter already opens the top match; saying so is the difference
                between a search box and a box people retype into. */}
            <kbd
              aria-hidden
              className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-soft transition-opacity ${
                q.trim() && matches.length > 0 ? "opacity-100" : "opacity-0"
              }`}
            >
              Enter
            </kbd>
            {q.trim() && (
              <div className="mt-2 overflow-hidden rounded-xl border border-line bg-surface">
                {matches.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-ink-soft">
                    맞는 워크스페이스를 못 찾았습니다. 아래에서 직접 골라 보세요.
                  </p>
                ) : (
                  <ul>
                    {matches.slice(0, 6).map((a, i) => (
                      <li key={a.slug}>
                        <button
                          onClick={() => open(a.slug)}
                          className="flex w-full items-center gap-3 border-line px-4 py-2.5 text-left hover:bg-canvas"
                          style={{ borderTopWidth: i === 0 ? 0 : 1 }}
                        >
                          <span style={{ color: STAGE_META[a.stage].color }}>
                            <StageIcon stage={a.stage} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">
                              {a.label}
                            </span>
                            <span className="block truncate text-xs text-ink-soft">
                              {a.blurb}
                            </span>
                          </span>
                          {i === 0 && (
                            <kbd className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-soft">
                              Enter
                            </kbd>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {recentAgents.length > 0 && !q.trim() && (
            <section className="mt-8">
              <h2 className="text-[11px] font-semibold tracking-wide text-ink-soft">
                최근 사용
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {recentAgents.map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/w/${a.slug}`}
                      className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:border-accent"
                    >
                      <span style={{ color: STAGE_META[a.stage].color }}>
                        <StageIcon stage={a.stage} className="size-3.5" />
                      </span>
                      {a.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          </div>
        </div>

        <div className="mx-auto w-full max-w-4xl px-6 pb-12">
          {!q.trim() && (
            <div className="mt-9 flex flex-col gap-7">
              {STAGES.map((stage) => {
                const meta = STAGE_META[stage];
                const items = agents.filter((a) => a.stage === stage);
                const returning = stage === fromStage;
                return (
                  <section
                    key={stage}
                    id={`stage-${stage}`}
                    className="scroll-mt-6 rounded-xl transition-colors"
                    style={
                      returning
                        ? {
                            // Just enough tint to answer "where was I?" without
                            // turning into a permanent selected state.
                            backgroundColor: `color-mix(in srgb, ${meta.color} 5%, transparent)`,
                            boxShadow: `0 0 0 10px color-mix(in srgb, ${meta.color} 5%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-md"
                        style={{
                          color: meta.color,
                          backgroundColor: `color-mix(in srgb, ${meta.color} 11%, transparent)`,
                        }}
                      >
                        <StageIcon stage={stage} className="size-3.5" />
                      </span>
                      <h2 className="shrink-0 text-sm font-semibold tracking-tight">
                        {stage}
                      </h2>
                      <p className="min-w-0 truncate text-xs text-ink-soft">
                        {meta.what}
                      </p>
                      {/* A hairline that runs to the edge separates seven
                          sections without seven heavy borders. */}
                      <span
                        aria-hidden
                        className="h-px min-w-4 flex-1"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${meta.color} 20%, transparent)`,
                        }}
                      />
                    </div>
                    <ul className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((a) => (
                        <li key={a.slug}>
                          <Link
                            href={`/w/${a.slug}`}
                            className="group flex h-full flex-col rounded-xl border border-line bg-surface p-3.5 pl-4 transition-all hover:-translate-y-0.5 hover:border-transparent hover:shadow-[0_4px_14px_rgba(18,21,26,0.10)]"
                            style={{
                              borderLeftColor: meta.color,
                              borderLeftWidth: 3,
                            }}
                          >
                            <span className="flex items-start gap-2">
                              <span className="min-w-0 flex-1 text-sm font-medium leading-tight">
                                {a.label}
                              </span>
                              {/* The card looked like a tile, not a link. A
                                  chevron that slides on hover is the cheapest
                                  way to say "this opens somewhere". */}
                              <span
                                aria-hidden
                                className="mt-px shrink-0 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100"
                                style={{ color: meta.color }}
                              >
                                <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
                                  <path
                                    d="m6 3.5 4.5 4.5L6 12.5"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </span>
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
                              {a.blurb}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}

          <footer className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-4 text-xs text-ink-soft">
            <span>
              전송 전 고객정보 자동 마스킹 — 이메일 · 전화 · 주민번호 · 사업자번호
              · 카드번호
            </span>
            {degraded.length > 0 && (
              <p className="mt-2 text-xs text-orange-700">
                플레이북 누락: {degraded.map((a) => a.label).join(", ")} — 에이전트가
                스킬을 찾지 못해 답변 품질이 떨어집니다.
              </p>
            )}
            {down.length > 0 && (
              <span className="text-warn">
                점검 필요: {down.map((a) => a.label).join(", ")}
              </span>
            )}
          </footer>
        </div>
      </main>
    </div>
  );
}
