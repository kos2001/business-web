import { NextResponse } from "next/server";
import { findAgent } from "@/lib/agents";
import { errorResponse } from "@/lib/api-errors";
import { startRun } from "@/lib/hermes";
import { redact } from "@/lib/redact";
import { corpusIndexed, searchCorpus } from "@/lib/corpus";

export const dynamic = "force-dynamic";

interface Body {
  agent?: string;
  input?: string;
  history?: { role: string; content: string }[];
  sessionId?: string;
  /** Client may ask to send verbatim; redaction is on unless explicitly off. */
  protect?: boolean;
  /** Non-chat job to run instead of a conversation turn. */
  action?: "report";
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

  // The report action belonged to the mi-report backend's own authoring
  // pipeline. Nothing serves it now, and accepting it silently would start an
  // ordinary chat turn with an empty prompt.
  if (body.action === "report") {
    return NextResponse.json(
      { error: "리포트 생성 백엔드가 더 이상 없습니다. 질문으로 물어보세요." },
      { status: 400 },
    );
  }

  const raw = String(body.input ?? "").trim();
  if (!raw) {
    return NextResponse.json({ error: "Empty input" }, { status: 400 });
  }

  // Redaction runs server-side and defaults on. See src/lib/redact.ts.
  const protect = body.protect !== false;
  const { text, hits } = protect ? redact(raw) : { text: raw, hits: {} };

  // Contract work turns on precedent — what our standard says, what we agreed
  // with this customer last time. Retrieving it here rather than asking the
  // agent to search means the passages arrive with the question instead of
  // depending on the model choosing to look, and the citations are exact.
  let grounded = text;
  if (agent.corpus && corpusIndexed()) {
    const hits = await searchCorpus(text, 5).catch(() => []);
    if (hits.length > 0) {
      grounded =
        `${text}\n\n[사내 계약 코퍼스 검색 결과 — 참고용 선례]\n` +
        hits
          .map((h) => `- (${h.document}) ${h.text}`)
          .join("\n") +
        "\n위 선례는 참고이고 지금 검토 대상 계약서가 아니다. " +
        "인용할 때는 출처 문서명을 함께 밝힌다.";
    }
  }

  try {
    const run = await startRun({
      upstream: agent.upstream,
      model: agent.model,
      input: grounded,
      instructions: agent.instructions,
      history: body.history,
      sessionId: body.sessionId,
    });
    return NextResponse.json({ ...run, agent: agent.slug, redacted: hits });
  } catch (err) {
    return errorResponse(err);
  }
}
