"use client";

import { useEffect, useState } from "react";
import Sidebar, { type HealthMap, type NavItem } from "./Sidebar";
import type { Stage } from "@/lib/agents";

/**
 * Sidebar plus page, and the one place that decides what happens when the
 * window is not desktop-shaped.
 *
 * ## The bug this fixes
 *
 * The sidebar was `hidden … sm:flex` with nothing behind it. Below 640px — which
 * is what browser zoom produces long before anyone reaches a phone — the app
 * lost every link it had: no workspaces, no dashboard, no settings. The only
 * way out of a page was the breadcrumb. Zooming in to read a contract clause
 * took the navigation away.
 *
 * Hiding the sidebar there is still right; 256px of a 500px window is not a
 * trade worth making. What was missing is the replacement.
 *
 * ## Why this component exists at all
 *
 * `<div className="flex h-dvh"><Sidebar/>…</div>` was written out in eight
 * files. Fixing the narrow case in eight places is how seven of them stay
 * broken, and the last one drifts.
 */
export default function AppShell({
  nav,
  health,
  slug,
  stage,
  recents,
  onReset,
  children,
}: {
  nav: NavItem[];
  health: HealthMap;
  slug?: string;
  stage?: Stage;
  recents?: string[];
  onReset?: () => void;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  // A link inside the drawer navigates without unmounting the shell, so the
  // drawer would still be open on the next page. Closing on slug change is the
  // narrowest fix that does not require every link to know about the drawer.
  useEffect(() => setMenuOpen(false), [slug]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="flex h-dvh flex-col sm:flex-row">
      {/* Only below the sidebar's breakpoint, so the wide layout is untouched. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2 sm:hidden">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="메뉴 열기"
          aria-expanded={menuOpen}
          className="flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
        >
          <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
            <path
              d="M3 5.5h14M3 10h14M3 14.5h14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <span className="flex size-6 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-white">
          영
        </span>
        <span className="text-sm font-medium">영업 에이전트</span>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-40 flex sm:hidden">
          <div
            className="absolute inset-0 bg-ink/30"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          {/* `forceVisible` overrides the sidebar's own `hidden sm:flex`; the
              drawer is the narrow-screen answer, not a second nav to maintain. */}
          <div className="relative z-50 h-full">
            <Sidebar
              nav={nav}
              health={health}
              slug={slug}
              stage={stage}
              recents={recents}
              onReset={onReset}
              forceVisible
            />
          </div>
        </div>
      )}

      <Sidebar
        nav={nav}
        health={health}
        slug={slug}
        stage={stage}
        recents={recents}
        onReset={onReset}
      />
      {children}
    </div>
  );
}
