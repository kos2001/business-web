import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { findAgent } from "@/lib/agents";
import { errorResponse } from "@/lib/api-errors";
import { startRun } from "@/lib/hermes";
import { reserve } from "@/lib/pending-runs";
import { redact } from "@/lib/redact";

export const dynamic = "force-dynamic";

interface Body {
  agent?: string;
  input?: string;
  history?: { role: string; content: string }[];
  sessionId?: string;
  /** Client may ask to send verbatim; redaction is on unless explicitly off. */
  protect?: boolean;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const agent = findAgent(String(body.agent ?? ""));
  if (!agent) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
  }

  const raw = String(body.input ?? "").trim();
  if (!raw) {
    return NextResponse.json({ error: "Empty input" }, { status: 400 });
  }

  // Redaction runs server-side and defaults on. See src/lib/redact.ts.
  const protect = body.protect !== false;
  const { text, hits } = protect ? redact(raw) : { text: raw, hits: {} };

  // mi-report streams its answer from the same request that starts it, so there
  // is nothing to start here — reserve an id and let the events route drive it.
  // See src/lib/pending-runs.ts for why the split exists at all.
  if (agent.backend === "mi-report") {
    const runId = `mi_${randomUUID().replace(/-/g, "")}`;
    reserve(runId, { prompt: text, sessionId: body.sessionId });
    return NextResponse.json({
      run_id: runId,
      status: "started",
      agent: agent.slug,
      redacted: hits,
    });
  }

  try {
    const run = await startRun({
      upstream: agent.upstream,
      model: agent.model,
      input: text,
      history: body.history,
      sessionId: body.sessionId,
    });
    return NextResponse.json({ ...run, agent: agent.slug, redacted: hits });
  } catch (err) {
    return errorResponse(err);
  }
}
