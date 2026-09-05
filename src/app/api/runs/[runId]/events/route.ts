import { findAgent } from "@/lib/agents";
import { errorResponse } from "@/lib/api-errors";
import { runEvents } from "@/lib/hermes";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Next dev and most proxies buffer SSE without this.
  "X-Accel-Buffering": "no",
} as const;

/**
 * Streams a run to the browser.
 *
 * The `agent` query param is what lets us re-derive the upstream — the browser
 * never learns upstream names, and hermes needs the upstream pin on *this*
 * request too or it answers `run_not_found`.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const { runId } = await ctx.params;
  const agent = findAgent(new URL(req.url).searchParams.get("agent") ?? "");
  if (!agent) return new Response("Unknown agent", { status: 404 });

  try {
    const upstream = await runEvents(runId, agent.upstream, req.signal);
    return new Response(upstream.body, { headers: SSE_HEADERS });
  } catch (err) {
    return errorResponse(err);
  }
}
