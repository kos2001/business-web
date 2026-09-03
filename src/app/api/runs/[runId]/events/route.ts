import { findAgent } from "@/lib/agents";
import { errorResponse } from "@/lib/api-errors";
import { runEvents } from "@/lib/hermes";
import {
  DEFAULT_REPORT_PARAMS,
  miChatAsRunEvents,
  miGenerateReportAsRunEvents,
} from "@/lib/mi-report";
import { maDiagnoseAsRunEvents } from "@/lib/marketing-agent";
import {
  claimForStart,
  isKnown,
  replay,
  startRecording,
} from "@/lib/pending-runs";

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

  if (agent.backend !== "hermes") {
    // Start the backend at most once per run. A second request — StrictMode's
    // double effect, a refresh, a reconnect — falls through to replay rather
    // than kicking off another minutes-long pipeline. See pending-runs.ts.
    const pendingRun = claimForStart(runId);

    if (pendingRun) {
      try {
        let source: ReadableStream<Uint8Array>;
        // Deliberately not passing `req.signal`: the recording must outlive the
        // request that started it, or closing the tab kills the run.
        if (pendingRun.kind === "diagnose") {
          source = await maDiagnoseAsRunEvents(runId, {
            text: pendingRun.prompt,
          });
        } else if (pendingRun.kind === "report") {
          source = await miGenerateReportAsRunEvents(runId, {
            ...DEFAULT_REPORT_PARAMS,
            period: pendingRun.prompt,
          });
        } else {
          source = await miChatAsRunEvents(runId, {
            message: pendingRun.prompt,
            sessionId: pendingRun.sessionId,
          });
        }
        startRecording(runId, source);
      } catch (err) {
        return errorResponse(err);
      }
    } else if (!isKnown(runId)) {
      return new Response(
        "실행을 찾을 수 없습니다. 만료되었거나 서버가 재시작되었습니다. 다시 요청해 주세요.",
        { status: 404 },
      );
    }

    // Every reader, first or fifth, goes through the recording.
    const stream = replay(runId, req.signal);
    if (!stream) {
      return new Response("실행 기록을 찾을 수 없습니다.", { status: 404 });
    }
    return new Response(stream, { headers: SSE_HEADERS });
  }

  try {
    const upstream = await runEvents(runId, agent.upstream, req.signal);
    return new Response(upstream.body, { headers: SSE_HEADERS });
  } catch (err) {
    return errorResponse(err);
  }
}
