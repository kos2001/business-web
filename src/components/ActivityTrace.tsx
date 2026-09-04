"use client";

import { useEffect, useState } from "react";
import { labelForTool, formatDuration, type ToolKind } from "@/lib/tool-labels";
import type { ToolTrace } from "./useRun";

/**
 * What the agent is doing, while it does it.
 *
 * A contract review runs for a minute or more. Before this, that minute showed
 * a disabled composer and a list of raw tool names (`skill_view`, `terminal`)
 * that vanished the moment the answer arrived. Two things were wrong with that:
 * during the wait it read as stuck, and afterwards there was no record of what
 * the answer was based on.
 *
 * So the trace is translated into the user's vocabulary, it counts up so the
 * wait is legibly progressing rather than hung, and **it survives completion**
 * as a collapsed summary. Someone reading a review a day later can still see
 * that the agent opened the playbook and read the attachment.
 */

const KIND_COLOR: Record<ToolKind, string> = {
  playbook: "var(--color-accent)",
  document: "#0e7490",
  search: "#7c3aed",
  compute: "#c2790a",
  other: "var(--color-ink-soft)",
};

function Glyph({ kind, done }: { kind: ToolKind; done: boolean }) {
  const color = KIND_COLOR[kind];
  if (done) {
    return (
      <svg viewBox="0 0 14 14" className="size-3.5 shrink-0" aria-hidden>
        <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth="1.2" opacity=".35" />
        <path
          d="m4.4 7.2 1.9 1.9 3.4-4"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" className="size-3.5 shrink-0" aria-hidden>
      <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth="1.2" opacity=".25" />
      {/* A rotating arc, not a pulse: a pulse says "waiting", an arc says
          "working", and the difference is what the user is actually asking. */}
      <path d="M7 1 a6 6 0 0 1 6 6" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 7 7"
          to="360 7 7"
          dur="900ms"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

/** Counts up from mount. The only honest progress signal for an open-ended run. */
function Elapsed({ from }: { from: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const text = formatDuration((now - from) / 1000);
  return text ? <span className="tabular-nums text-ink-soft/70">{text}</span> : null;
}

export default function ActivityTrace({
  tools,
  running,
  startedAt,
}: {
  tools: ToolTrace[];
  running: boolean;
  /** When the run began, for the elapsed counter. */
  startedAt?: number;
}) {
  // Collapsed by default once finished: the finished answer is what the reader
  // came for, and the trace is evidence they can open if they want it.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (running) setOpen(true);
  }, [running]);

  if (tools.length === 0 && !running) return null;

  const done = tools.filter((t) => t.done).length;

  return (
    <section
      className="rounded-xl border border-line bg-surface/60 px-3.5 py-2.5"
      aria-live={running ? "polite" : "off"}
      aria-label="에이전트 작업 내역"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        {running ? (
          <Glyph kind="compute" done={false} />
        ) : (
          <Glyph kind="playbook" done />
        )}
        <span className="text-xs font-medium">
          {running ? "작업 중" : `작업 ${tools.length}단계 완료`}
        </span>
        {running && tools.length > 0 && (
          <span className="text-xs text-ink-soft">
            {done}/{tools.length}
          </span>
        )}
        <span className="flex-1" />
        {running && startedAt !== undefined && <Elapsed from={startedAt} />}
        <svg
          viewBox="0 0 12 12"
          className={`size-3 shrink-0 text-ink-soft transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          <path
            d="m4.5 2.5 3.5 3.5-3.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && tools.length > 0 && (
        <ol className="mt-2 flex flex-col gap-1.5 border-l border-line pl-3">
          {tools.map((t, i) => {
            const { label, kind } = labelForTool(t.tool);
            return (
              <li key={i} className="flex items-start gap-2 text-xs leading-snug">
                <span className="mt-px">
                  <Glyph kind={kind} done={t.done} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={t.done ? "text-ink-soft" : "text-ink"}>{label}</span>
                  {t.preview && (
                    <span className="ml-1.5 break-all text-ink-soft/70">{t.preview}</span>
                  )}
                </span>
                {t.duration !== undefined && formatDuration(t.duration) && (
                  <span className="shrink-0 tabular-nums text-ink-soft/60">
                    {formatDuration(t.duration)}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
