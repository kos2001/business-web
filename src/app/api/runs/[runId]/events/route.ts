import { findAgent } from "@/lib/agents";
import { runEvents } from "@/lib/hermes";
import { errorResponse } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * Pipes the hermes run stream to the browser unchanged.
 *
 * The `agent` query param is what lets us re-derive the upstream — the browser
 * never learns upstream names, and the gateway needs the pin on this request
 * too or it answers `run_not_found`.
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
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Next dev and most proxies buffer SSE without this.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
