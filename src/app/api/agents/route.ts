import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/agents";
import { listSkills, upstreamHealth } from "@/lib/hermes";
import { missingPlaybooks } from "@/lib/playbook-health";

export const dynamic = "force-dynamic";

/**
 * The roster plus live backend status, so the nav can show what is reachable.
 *
 * "Reachable" covers two different things, and conflating them hides real
 * breakage. An upstream can answer its health check while the playbooks its
 * workspaces name are not installed — that is not a hypothetical: 33 of 40 were
 * missing at one point and every workspace still showed healthy, because the
 * agent silently answers from its persona when it cannot find a skill. So the
 * playbooks are checked separately and reported per workspace.
 */
export async function GET() {
  const upstreams = [...new Set(AGENTS.map((a) => a.upstream))];

  const [health, skillsByUpstream] = await Promise.all([
    upstreamHealth().catch(() => ({}) as Record<string, string>),
    skillsFor(upstreams),
  ]);

  return NextResponse.json({
    agents: AGENTS.map((a) => ({
      slug: a.slug,
      label: a.label,
      blurb: a.blurb,
      stage: a.stage,
      starters: a.starters,
      status: health[a.upstream] ?? "unknown",
      // Absent (rather than empty) when the skill list could not be read, so
      // the UI can tell "nothing missing" from "could not check".
      missingPlaybooks: missingPlaybooks(
        a.playbooks,
        skillsByUpstream[a.upstream],
      ),
    })),
  });
}

/** Skill names per upstream. An upstream that fails to answer is omitted. */
async function skillsFor(
  upstreams: string[],
): Promise<Record<string, Set<string>>> {
  const entries = await Promise.all(
    upstreams.map(async (u) => {
      try {
        return [u, await listSkills(u)] as const;
      } catch {
        return [u, null] as const;
      }
    }),
  );
  return Object.fromEntries(
    entries.filter((e): e is readonly [string, Set<string>] => e[1] !== null),
  );
}

