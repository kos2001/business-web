"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STAGES, type Stage } from "@/lib/agents";
import { STAGE_META } from "@/lib/stage-meta";
import StageIcon from "./StageIcon";

export interface NavItem {
  slug: string;
  label: string;
  stage: Stage;
}

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
  onReset,
}: {
  nav: NavItem[];
  /** Empty on the home board, where no workspace is open. */
  slug?: string;
  /** Absent on the home board — nothing is active, so nothing force-opens. */
  stage?: Stage;
  health: Record<string, string>;
  /** Absent on the home board, which has no conversation to reset. */
  onReset?: () => void;
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

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface sm:flex">
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

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-3">
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
                    const status = health[item.slug];
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
                            status === "ok"
                              ? "백엔드 정상"
                              : status
                                ? "백엔드 확인 필요"
                                : "상태 확인 중"
                          }
                          className={`size-1.5 shrink-0 rounded-full ${
                            status === "ok"
                              ? "bg-emerald-500"
                              : status
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

      {onReset && (
        <div className="border-t border-line p-2.5">
          <button
            onClick={onReset}
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-soft hover:bg-canvas"
          >
            새 대화 시작
          </button>
        </div>
      )}
    </aside>
  );
}
