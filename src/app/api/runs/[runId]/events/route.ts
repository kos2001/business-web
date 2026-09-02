import { findAgent } from "@/lib/agents";
import { errorResponse } from "@/lib/api-errors";
import { runEvents } from "@/lib/hermes";
import {
  DEFAULT_REPORT_PARAMS,
  miChatAsRunEvents,
  miGenerateReportAsRunEvents,
} from "@/lib/mi-report";
import { claim } from "@/lib/pending-runs";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Next dev and most proxies buffer SSE without this.
  "X-Accel-Buffering": "no",
} as const;

/**
 * Streams a run to the browser as hermes-shaped events, whichever backend
 * produced it.
 *
 * The `agent` query param is what lets us re-derive the backend and upstream —
 * the browser never learns upstream names, and hermes needs the upstream pin on
 * *this* request too or it answers `run_not_found`.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const { runId } = await ctx.params;
  const agent = findAgent(new URL(req.url).searchParams.get("agent") ?? "");
  if (!agent) return new Response("Unknown agent", { status: 404 });

  if (agent.backend === "mi-report") {
    const pendingRun = claim(runId);
    if (!pendingRun) {
      return new Response("Run not found or already streamed", { status: 404 });
    }
    try {
      const stream =
        pendingRun.kind === "report"
          ? await miGenerateReportAsRunEvents(
              runId,
              { ...DEFAULT_REPORT_PARAMS, period: pendingRun.prompt },
              req.signal,
            )
          : await miChatAsRunEvents(
              runId,
              { message: pendingRun.prompt, sessionId: pendingRun.sessionId },
              req.signal,
            );
      return new Response(stream, { headers: SSE_HEADERS });
    } catch (err) {
      return errorResponse(err);
    }
  }

  try {
    const upstream = await runEvents(runId, agent.upstream, req.signal);
    return new Response(upstream.body, { headers: SSE_HEADERS });
  } catch (err) {
    return errorResponse(err);
  }
}
