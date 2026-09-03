import { STAGE_META } from "@/lib/stage-meta";
import type { Stage } from "@/lib/agents";

/** The domain's icon, stroked in `currentColor` so the caller sets the hue. */
export default function StageIcon({
  stage,
  className = "size-4",
}: {
  stage: Stage;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={STAGE_META[stage].icon} />
    </svg>
  );
}
