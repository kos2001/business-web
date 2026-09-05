import Link from "next/link";
import StageIcon from "./StageIcon";
import { STAGE_META } from "@/lib/stage-meta";
import type { Stage } from "@/lib/agents";

/**
 * The banded top of every page.
 *
 * It existed six times, copy-pasted, with the class strings drifting apart — one
 * page had a smaller heading and no band at all, which made it read as a
 * different product. A header is exactly the sort of thing nobody re-checks
 * after the first time, so it has to be one component or it will diverge again.
 *
 * The band itself is load-bearing rather than decorative: the home board and a
 * workspace once shared a background, and opening a card felt like a tab
 * changing rather than a page opening. Giving every destination the same
 * surface is half of what makes navigation feel like navigation.
 */

export interface Crumb {
  label: string;
  href: string;
}

export default function PageHeader({
  title,
  lead,
  crumbs,
  stage,
  eyebrow,
  children,
}: {
  title: string;
  /** One sentence on what this page is for. */
  lead?: string;
  /** Trail back to where the reader came from. */
  crumbs?: Crumb[];
  /** Shows the domain's icon and colour beside the title. */
  stage?: Stage;
  /** Small label above the title, when the title alone lacks context. */
  eyebrow?: string;
  /** Stats, a search box — anything that belongs inside the band. */
  children?: React.ReactNode;
}) {
  const meta = stage ? STAGE_META[stage] : null;

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto w-full max-w-4xl px-6 pb-8 pt-12">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="위치" className="flex items-center gap-1.5 text-xs text-ink-soft">
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                <Link href={c.href} className="hover:text-accent hover:underline">
                  {c.label}
                </Link>
              </span>
            ))}
          </nav>
        )}
        {eyebrow && (
          <p className="text-xs font-medium tracking-wide text-ink-soft/70">{eyebrow}</p>
        )}

        <div className={`flex items-center gap-2.5 ${crumbs || eyebrow ? "mt-1" : ""}`}>
          {meta && (
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl"
              style={{
                color: meta.color,
                backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
              }}
            >
              <StageIcon stage={stage!} className="size-[18px]" />
            </span>
          )}
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
        </div>

        {lead && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{lead}</p>
        )}
        {children}
      </div>
    </div>
  );
}
