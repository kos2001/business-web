"use client";

/**
 * A thing worth acting on, with the reason attached.
 *
 * Three pages had grown their own version of this — focus points on the domain
 * dashboard, store problems on the status page, defects on the answer check —
 * each with its own border treatment for the same three severities. Severity
 * has to look identical everywhere or it stops being a signal and becomes
 * per-page styling.
 */

export type Severity = "urgent" | "attention" | "info";

export const SEVERITY_COLOR: Record<Severity, string> = {
  urgent: "var(--color-warn)",
  attention: "var(--color-accent)",
  info: "var(--color-line)",
};

export default function FindingCard({
  severity,
  title,
  why,
  active = false,
  onClick,
  hint,
  children,
}: {
  severity: Severity;
  title: string;
  /** One line on why this is on the list. */
  why: string;
  /** Selected — the list below is filtered to this. */
  active?: boolean;
  /** Absent when there is nothing to narrow to; the card then renders inert. */
  onClick?: () => void;
  /** Appended to the title, e.g. "· 눌러서 이 항목만 보기". */
  hint?: string;
  /** Links or chips belonging to the finding. */
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span
          className="text-sm font-medium"
          style={severity === "urgent" ? { color: "var(--color-warn)" } : undefined}
        >
          {title}
        </span>
        {hint && <span className="text-[11px] text-ink-soft">{hint}</span>}
      </span>
      <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{why}</span>
      {children}
    </>
  );

  const style = {
    borderColor: active ? SEVERITY_COLOR[severity] : "var(--color-line)",
    borderLeftWidth: 3,
    borderLeftColor: SEVERITY_COLOR[severity],
  };

  if (!onClick) {
    return (
      <li className="rounded-xl border bg-surface px-3.5 py-3" style={style}>
        {body}
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={onClick}
        aria-pressed={active}
        className="w-full rounded-xl border bg-surface px-3.5 py-3 text-left transition-colors hover:bg-canvas"
        style={style}
      >
        {body}
      </button>
    </li>
  );
}
