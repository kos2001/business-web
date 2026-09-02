import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/agents";
import { upstreamHealth } from "@/lib/hermes";
import { miHealthy } from "@/lib/mi-report";

export const dynamic = "force-dynamic";

/** The roster plus live backend status, so the nav can show what is reachable. */
export async function GET() {
  const [health, mi] = await Promise.all([
    upstreamHealth().catch(() => ({}) as Record<string, string>),
    miHealthy().catch(() => false),
  ]);

  return NextResponse.json({
    agents: AGENTS.map((a) => ({
      slug: a.slug,
      label: a.label,
      blurb: a.blurb,
      stage: a.stage,
      starters: a.starters,
      status:
        a.backend === "mi-report"
          ? mi
            ? "ok"
            : "down"
          : (health[a.upstream] ?? "unknown"),
    })),
  });
}
