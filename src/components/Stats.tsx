/**
 * Counts, and the proportion behind them.
 *
 * The two dashboards showed the same four numbers two different ways — boxed
 * tiles on one, an inline strip on the other — which made them look like
 * different measurements. They are the same measurement.
 *
 * `tone: "urgent"` is the only variation kept, and only when the value is above
 * zero: colouring a zero red trains people to read the colour as decoration.
 */

export interface Stat {
  label: string;
  value: number;
  tone?: "urgent" | "normal";
  /**
   * Makes the tile a filter for the list below it.
   *
   * A count with nothing behind it is a dead end — the improvement page showed
   * "전체 발견 14" above an empty list, because only recurring defects were
   * listed and none had recurred yet. The fourteen were the material for the
   * improvement and there was no way to reach them. Tiles that can open are how
   * a number stops being trivia.
   *
   * Optional: a tile with no handler stays a plain box, so the pages that only
   * report numbers are unchanged.
   */
  onSelect?: () => void;
  /** This tile's filter is the one currently applied. */
  selected?: boolean;
}

export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {stats.map((s) => {
        const urgent = s.tone === "urgent" && s.value > 0;
        const border = s.selected
          ? { borderColor: "var(--color-accent)", borderLeftWidth: 3 }
          : urgent
            ? { borderColor: "var(--color-warn)", borderLeftWidth: 3 }
            : { borderColor: "var(--color-line)" };
        // A real button when it does something, so it is reachable by keyboard
        // and announced as a control; a plain box when it does not, so nothing
        // invites a click that goes nowhere.
        const Tag = s.onSelect ? "button" : "div";
        return (
          <Tag
            key={s.label}
            onClick={s.onSelect}
            aria-pressed={s.onSelect ? s.selected === true : undefined}
            className={`rounded-xl border bg-surface px-3.5 py-3 text-left ${
              s.onSelect ? "transition-colors hover:border-accent" : ""
            }`}
            style={border}
          >
            <div
              className="text-2xl font-semibold tabular-nums leading-none"
              style={urgent ? { color: "var(--color-warn)" } : undefined}
            >
              {s.value}
            </div>
            <div className="mt-1.5 text-xs text-ink-soft">{s.label}</div>
          </Tag>
        );
      })}
    </div>
  );
}

/**
 * A one-line bar showing how a total splits.
 *
 * Three numbers side by side make the reader do arithmetic to see whether a
 * workspace is mostly done or mostly stuck. A bar answers that before it is
 * read. It carries no information the numbers beside it do not — which is the
 * test for whether a graphic earns its place: it must make an existing fact
 * faster to see, not decorate the absence of one.
 */
export function SplitBar({
  segments,
  total,
}: {
  segments: { value: number; color: string; label: string }[];
  /** The whole the segments divide. Below two there is nothing to divide. */
  total: number;
}) {
  // One item has no proportion to show — the bar would be a single block of
  // colour saying nothing the number beside it does not already say, and a
  // graphic that carries no information is just a line across the card.
  if (total < 2) return null;
  return (
    <span
      className="mt-1.5 flex h-1 w-full overflow-hidden rounded-full bg-canvas"
      role="img"
      aria-label={segments
        .filter((s) => s.value > 0)
        .map((s) => `${s.label} ${s.value}`)
        .join(", ")}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <span
            key={s.label}
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
          />
        ))}
    </span>
  );
}
