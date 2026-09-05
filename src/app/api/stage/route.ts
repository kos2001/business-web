import { NextResponse } from "next/server";
import { AGENTS, STAGES, type Stage } from "@/lib/agents";
import { listActions, summarise } from "@/lib/actions";
import { focusPoints, rollUpByWorkspace } from "@/lib/stage-focus";

/**
 * Everything one work domain's dashboard needs, in one request.
 *
 * The page could assemble this from `/api/actions?workspace=` four times and do
 * the grouping in the browser, but then the definition of "overdue" would live
 * in two places, and the client copy would be the one that drifts. The rules
 * that decide what is urgent belong next to the data they read.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("stage");
  if (!name || !(STAGES as readonly string[]).includes(name)) {
    return NextResponse.json(
      { error: `stage 는 ${STAGES.join(", ")} 중 하나여야 합니다.` },
      { status: 400 },
    );
  }
  const stage = name as Stage;
  const workspaces = AGENTS.filter((a) => a.stage === stage).map((a) => a.slug);
  const items = listActions({ workspaces });

  return NextResponse.json({
    stage,
    workspaces,
    items,
    summary: summarise({ workspaces }),
    focus: focusPoints({ items, workspaces }),
    rollUp: rollUpByWorkspace(items, workspaces),
  });
}
