import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/agents";
import { upstreamHealth } from "@/lib/hermes";

export const dynamic = "force-dynamic";

/** The roster plus live upstream status, so the nav can show what is reachable. */
export async function GET() {
  let health: Record<string, string> = {};
  try {
    health = await upstreamHealth();
  } catch {
    // A gateway that is down should render a degraded nav, not a 500 page.
  }

  return NextResponse.json({
    agents: AGENTS.map((a) => ({
      slug: a.slug,
      label: a.label,
      blurb: a.blurb,
      starters: a.starters,
      status: health[a.upstream] ?? "unknown",
    })),
  });
}
