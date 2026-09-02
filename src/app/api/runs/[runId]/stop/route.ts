import { NextResponse } from "next/server";
import { findAgent } from "@/lib/agents";
import { stopRun } from "@/lib/hermes";
import { errorResponse } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const { runId } = await ctx.params;
  const agent = findAgent(new URL(req.url).searchParams.get("agent") ?? "");
  if (!agent) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  // mi-report exposes no cancel endpoint. The browser aborts its fetch, which
  // drops the stream; there is nothing further to tell the backend.
  if (agent.backend === "mi-report") return NextResponse.json({ ok: true });

  try {
    await stopRun(runId, agent.upstream);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
