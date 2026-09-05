"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar, { type HealthMap, type NavItem } from "./Sidebar";
import { UTILITIES, UtilityIcon } from "./utilities";
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
  /** Whether the store has something worth looking at, for the dot. */
  const [storeWarn, setStoreWarn] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/stores")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { findings: { severity: string }[] }) => {
        if (live) setStoreWarn(d.findings.some((f) => f.severity === "urgent"));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  /**
   * Folded state, remembered.
   *
   * The sidebar remounts on every navigation, so without persistence the first
   * click would unfold it again and the button would be decorative. It starts
   * expanded on the server and corrects after mount — reading localStorage
   * during render is what produces a hydration mismatch.
   */
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
    } catch {
      // Private windows and blocked site data throw here; expanded is the
      // right default and no worse than before.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      } catch {
        // Not remembering is a smaller failure than not folding.
      }
      return next;
    });
  }

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
        <span className="flex-1" />
        {UTILITIES.map((u) => (
          <Link
            key={u.href}
            href={u.href}
            title={u.label}
            aria-label={u.label}
            className="relative flex size-8 items-center justify-center rounded-md text-ink-soft hover:bg-canvas hover:text-ink"
          >
            <UtilityIcon path={u.path} />
            {u.href === "/stores" && storeWarn && (
              <span
                className="absolute right-1 top-1 size-1.5 rounded-full"
                style={{ backgroundColor: "var(--color-warn)" }}
                aria-label="확인 필요"
              />
            )}
          </Link>
        ))}
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
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      {/* A real row above the page, not a floating one.
          It was positioned at first, to cost no vertical space — and scrolled
          content then passed underneath it, which is worse than the ~44px it
          was saving. Sitting outside the scroll container, it is always
          reachable and can never overlap anything.
          Hidden below the sidebar's breakpoint, where the narrow bar carries
          the same links. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="hidden shrink-0 justify-end border-b border-line bg-surface px-3 py-1 sm:flex">
          <div className="flex items-center gap-0.5">
            {/* The name under the icon, not only in a tooltip. A row of
                unlabelled glyphs in a corner is a guessing game until you have
                learned them, and this is where someone lands who does not know
                the app yet. There is room for it here — that was the reason for
                moving out of the sidebar. */}
            {UTILITIES.map((u) => (
              <Link
                key={u.href}
                href={u.href}
                title={u.label}
                aria-label={u.label}
                className="group relative flex w-[4.5rem] flex-col items-center gap-0.5 rounded-md px-1 py-1 text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
              >
                <span className="relative">
                  <UtilityIcon path={u.path} />
                  {u.href === "/stores" && storeWarn && (
                    <span
                      className="absolute -right-1 -top-0.5 size-1.5 rounded-full"
                      style={{ backgroundColor: "var(--color-warn)" }}
                      aria-label="확인 필요"
                    />
                  )}
                </span>
                <span className="w-full truncate text-center text-[10px] leading-tight">
                  {u.short ?? u.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
