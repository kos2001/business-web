"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STAGES, type Stage } from "@/lib/agents";
import { STAGE_META } from "@/lib/stage-meta";
import StageIcon from "./StageIcon";
import { UTILITIES, UtilityIcon } from "./utilities";

export interface NavItem {
  slug: string;
  label: string;
  stage: Stage;
}

/**
 * Per-workspace health.
 *
 * "degraded" is its own state on purpose. A workspace whose upstream answers
 * but whose playbooks are not installed looks perfectly healthy from the
 * outside while quietly producing worse answers — the agent cannot find the
 * skill and falls back to its persona. Showing that as green would hide the
 * exact failure this indicator exists to catch.
 */
export interface HealthEntry {
  state: string;
  /** Playbook names the agent could not see. Only set when degraded. */
  missing?: string[];
}

export type HealthMap = Record<string, HealthEntry>;

const STORE_KEY = "business-web:nav-collapsed";

/**
 * The workspace nav.
 *
 * Twenty-three entries do not fit on a laptop screen as a flat list, and a list
 * that scrolls hides exactly the thing a new user needs to see. So the domains
 * collapse: the one you are working in is open, the rest are one click away and
 * legible as a row of labelled headings. Your own opens and closes are kept in
 * localStorage, since people settle into two or three domains.
 *
 * The colour and icon are the same ones the home board uses, which is the point
 * — someone learns the domain's look once and then navigates by it.
 */
export default function Sidebar({
  nav,
  slug,
  stage,
  health,
  recents,
  onReset,
  forceVisible = false,
  collapsed = false,
  onToggleCollapsed,
}: {
  nav: NavItem[];
  /** Empty on the home board, where no workspace is open. */
  slug?: string;
  /** Absent on the home board — nothing is active, so nothing force-opens. */
  stage?: Stage;
  health: HealthMap;
  /** Recently opened slugs, newest first. Fills the space below the domains. */
  recents?: string[];
  /** Absent on the home board, which has no conversation to reset. */
  onReset?: () => void;
  /**
   * Shows it below the breakpoint where it normally hides — the narrow-screen
   * drawer. One nav rendered two ways rather than two navs to keep in step.
   */
  forceVisible?: boolean;
  /**
   * Folded to an icon rail.
   *
   * A rail rather than nothing: hiding the nav outright also hides which domain
   * you are standing in, and that orientation is most of what a sidebar is for.
   * The rail gives back roughly 200px and keeps it.
   */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  // Deterministic first paint — server and client agree that only the active
  // domain is open. Anything read from localStorage has to land after mount or
  // React reports a hydration mismatch.
  const [closed, setClosed] = useState<string[]>(() =>
    stage ? STAGES.filter((s) => s !== stage) : [...STAGES],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setClosed(JSON.parse(raw) as string[]);
    } catch {
      /* private mode, or a value we no longer understand — keep the default */
    }
  }, []);

  // The active domain is never left collapsed: arriving from the home board or
  // a link would otherwise show a nav with nothing highlighted in it.
  useEffect(() => {
    if (stage) setClosed((prev) => prev.filter((s) => s !== stage));
  }, [stage]);

  function toggle(target: string) {
    setClosed((prev) => {
      const next = prev.includes(target)
        ? prev.filter((s) => s !== target)
        : [...prev, target];
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        /* not being able to remember the choice is not worth an error */
      }
      return next;
    });
  }

  // Resolved against the roster so a stale slug (a workspace that was removed)
  // simply drops out rather than rendering a dead link.
  const recentList = (recents ?? [])
    .filter((s) => s !== slug)
    .map((s) => nav.find((n) => n.slug === s))
    .filter((n): n is NavItem => Boolean(n))
    .slice(0, 5);

  /**
   * What is stored, alongside the link to it.
   *
   * The corpus decays quietly: a document copied in by hand is invisible to
   * search, and an empty corpus makes every contract review answer from the
   * model's own knowledge while looking exactly as confident. Both were only
   * discoverable by opening a page on purpose, which is to say not discovered.
   *
   * A count here is the cheap version of noticing. It is a number and a dot,
   * not a panel — the detail already has a page, and the sidebar's job is to
   * say whether that page is worth opening today.
   */
  const [stores, setStores] = useState<{ docs: number; staged: number; warn: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/stores")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { corpus: { documents: unknown[] }; staging: { files: unknown[] }; findings: { severity: string }[] }) => {
        if (!live) return;
        setStores({
          docs: d.corpus.documents.length,
          staged: d.staging.files.length,
          warn: d.findings.some((f) => f.severity === "urgent"),
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // The drawer is never a rail: it opens because there is no room for a
  // sidebar, and a rail inside it would be a nav folded twice.
  const rail = collapsed && !forceVisible;

  return (
    <aside
      className={`shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-150 ${
        collapsed && !forceVisible ? "w-14" : "w-64"
      } ${forceVisible ? "flex h-full" : "hidden sm:flex"}`}
    >
      {rail ? (
        <div className="flex flex-col items-center gap-1 border-b border-line py-3">
          <Link
            href="/"
            aria-current={slug ? undefined : "page"}
            title="전체 업무 보기"
            className="flex size-8 items-center justify-center rounded-md hover:bg-canvas"
          >
            <span className="flex size-6 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-white">
              영
            </span>
          </Link>
        </div>
      ) : (
        <Link
          href="/"
          aria-current={slug ? undefined : "page"}
          className={`flex items-center gap-2 border-b border-line px-4 py-3.5 hover:bg-canvas ${
            slug ? "" : "bg-canvas"
          }`}
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-white">
            영
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight">
              영업 에이전트
            </span>
            <span className="block text-[11px] leading-tight text-ink-soft">
              전체 업무 보기
            </span>
          </span>
        </Link>
      )}

      {rail ? (
        // Stage icons only. Clicking one opens the sidebar on that domain,
        // which is what someone reaching for a collapsed nav is after.
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-3">
          {STAGES.map((s2) => {
            const meta2 = STAGE_META[s2];
            const active = stage === s2;
            return (
              <button
                key={s2}
                onClick={() => {
                  setClosed(STAGES.filter((x) => x !== s2));
                  onToggleCollapsed?.();
                }}
                title={`${s2} — ${meta2.what}`}
                aria-label={s2}
                className="flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-canvas"
                style={
                  active
                    ? {
                        color: meta2.color,
                        backgroundColor: `color-mix(in srgb, ${meta2.color} 12%, transparent)`,
                      }
                    : { color: "var(--color-ink-soft)" }
                }
              >
                <StageIcon stage={s2} className="size-4" />
              </button>
            );
          })}
        </nav>
      ) : (
      <div className="flex flex-1 flex-col overflow-y-auto">
      <nav className="flex flex-col gap-0.5 px-2.5 py-3">
        {STAGES.map((s) => {
          const meta = STAGE_META[s];
          const items = nav.filter((n) => n.stage === s);
          const open = !closed.includes(s);

          return (
            <div key={s}>
              <button
                onClick={() => toggle(s)}
                aria-expanded={open}
                // The domain names are the team's own shorthand; someone new to
                // the app gets the plain sentence on hover rather than having
                // to go back to the home board to find out what it covers.
                title={meta.what}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-canvas"
              >
                <span style={{ color: meta.color }}>
                  <StageIcon stage={s} className="size-3.5" />
                </span>
                <span className="flex-1 truncate text-[11px] font-semibold tracking-wide text-ink-soft">
                  {s}
                </span>
                <span className="text-[10px] tabular-nums text-ink-soft/60">
                  {items.length}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className={`size-3 text-ink-soft/50 transition-transform ${
                    open ? "rotate-90" : ""
                  }`}
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              {open && (
                <div className="mb-1 flex flex-col gap-0.5 pl-2">
                  {items.map((item) => {
                    const active = item.slug === slug;
                    const entry = health[item.slug];
                    const state = entry?.state;
                    return (
                      <Link
                        key={item.slug}
                        href={`/w/${item.slug}`}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-2 rounded-md border-l-2 py-1.5 pl-2.5 pr-2 text-sm ${
                          active
                            ? "font-medium"
                            : "border-transparent text-ink-soft hover:bg-canvas hover:text-ink"
                        }`}
                        style={
                          active
                            ? {
                                borderLeftColor: meta.color,
                                color: meta.color,
                                backgroundColor: `color-mix(in srgb, ${meta.color} 9%, transparent)`,
                              }
                            : undefined
                        }
                      >
                        <span className="flex-1 truncate">{item.label}</span>
                        <span
                          title={
                            state === "ok"
                              ? "백엔드 정상"
                              : state === "degraded"
                                ? `플레이북 누락: ${entry?.missing?.join(", ")} — 에이전트가 스킬을 찾지 못해 답변 품질이 떨어집니다`
                                : state
                                  ? "백엔드 확인 필요"
                                  : "상태 확인 중"
                          }
                          className={`size-1.5 shrink-0 rounded-full ${
                            state === "ok"
                              ? "bg-emerald-500"
                              : state === "degraded"
                                ? "bg-orange-500"
                                : state
                                  ? "bg-amber-500"
                                  : "bg-line"
                          }`}
                        />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      {/* The domains collapse, so most of the time the column below them is
          empty. Twenty-three workspaces is enough that people return to the
          same three or four, and this is exactly the space to put them in. The
          current one is skipped — a link to where you already are is noise. */}
      {recentList.length > 0 && (
        <div className="mx-2.5 border-t border-line pt-3">
          <p className="px-2 pb-1 text-[11px] font-medium text-ink-soft/70">
            최근
          </p>
          <div className="flex flex-col gap-0.5">
            {recentList.map((item) => (
              <Link
                key={item.slug}
                href={`/w/${item.slug}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-canvas hover:text-ink"
              >
                <span
                  aria-hidden
                  className="shrink-0"
                  style={{ color: STAGE_META[item.stage].color }}
                >
                  <StageIcon stage={item.stage} className="size-3.5" />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      </div>
      )}

      <div className="border-t border-line p-2.5">
        {/* The toggle lives with the nav it folds, at the bottom where it is out
            of the way of the thing people actually came to click. */}
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            title={rail ? "사이드바 펼치기" : "사이드바 접기"}
            aria-label={rail ? "사이드바 펼치기" : "사이드바 접기"}
            aria-expanded={!rail}
            className={`mb-1.5 flex items-center gap-2 rounded-md py-1.5 text-xs text-ink-soft transition-colors hover:bg-canvas hover:text-ink ${
              rail ? "w-full justify-center" : "w-full px-2.5"
            }`}
          >
            <svg viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0" aria-hidden>
              <path
                d={rail ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8 10 12.5"}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {!rail && "접기"}
          </button>
        )}
        {rail ? (
          // Only the daily one survives the fold. The settings pages are visited
          // once; putting five unlabelled icons in a 56px column to reach them
          // trades a clear nav for a guessing game.
          <>
            <Link
              href="/dashboard"
              title="다음 액션"
              aria-label="다음 액션"
              className="flex w-full justify-center rounded-md py-1.5 text-ink-soft hover:bg-canvas hover:text-ink"
            >
              <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
                <path
                  d="M2.5 8.5 6 12l7.5-8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            {/* The same four, stacked. Folded is where an icon-only nav is
                already the language, so they cost nothing extra here — and
                dropping them would make collapsing the sidebar the way to lose
                half the app. */}
            {UTILITIES.map((u) => (
              <Link
                key={u.href}
                href={u.href}
                title={u.label}
                aria-label={u.label}
                className="relative flex w-full justify-center rounded-md py-1.5 text-ink-soft hover:bg-canvas hover:text-ink"
              >
                <UtilityIcon path={u.path} />
                {u.href === "/stores" && stores?.warn && (
                  <span
                    className="absolute right-2.5 top-1 size-1.5 rounded-full"
                    style={{ backgroundColor: "var(--color-warn)" }}
                    aria-label="확인 필요"
                  />
                )}
              </Link>
            ))}
          </>
        ) : (
          <>
        {onReset && (
          <button
            onClick={onReset}
            className="mb-1.5 w-full rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-soft hover:bg-canvas"
          >
            새 대화 시작
          </button>
        )}
        {/* Above the settings link, because outstanding work is something you
            check daily and permissions are something you set once. */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-ink-soft hover:bg-canvas hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden>
            <path
              d="M2.5 8.5 6 12l7.5-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          다음 액션
        </Link>
        {/* 반복되는 결함 · 문서와 저장소 · 접근 권한 · Confluence 는 상단
            아이콘 바로 옮겼다. 여기 남은 둘은 업무에 대한 것이고, 옮긴 넷은
            시스템에 대한 것이다. */}
          </>
        )}
      </div>
    </aside>
  );
}
