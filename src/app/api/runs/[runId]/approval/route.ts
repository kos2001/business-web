import { NextResponse } from "next/server";
import { findAgent } from "@/lib/agents";
import { respondToApproval, type ApprovalChoice } from "@/lib/hermes";
import { errorResponse } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

const CHOICES: ApprovalChoice[] = ["once", "session", "always", "deny"];

/** Resolves a `approval.request` the agent raised mid-run. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const { runId } = await ctx.params;

  let body: { agent?: string; choice?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const agent = findAgent(String(body.agent ?? ""));
  if (!agent) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  if (agent.backend !== "hermes") {
    return NextResponse.json(
      { error: "이 백엔드는 승인 흐름을 지원하지 않습니다." },
      { status: 400 },
    );
  }

  const choice = String(body.choice ?? "") as ApprovalChoice;
  if (!CHOICES.includes(choice)) {
    return NextResponse.json(
      { error: `choice must be one of: ${CHOICES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    await respondToApproval(runId, agent.upstream, choice);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
