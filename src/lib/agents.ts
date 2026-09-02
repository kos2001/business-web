/**
 * The agent roster.
 *
 * Each workspace in the UI is one hermes-agent api_server instance reached
 * through hermes-gateway. Adding a workspace is editing this list — there is
 * no orchestration layer in this app to teach about a new agent, because the
 * orchestration lives inside hermes itself (tools, skills, sub-agents, its own
 * approval loop). The web tier is a faithful client of `/v1/runs`, nothing more.
 *
 * `upstream` must match a key in the gateway's HERMES_UPSTREAMS, and `model`
 * an id from GET /v1/models. Verify with:
 *   curl -s localhost:8700/v1/models -H "Authorization: Bearer $KEY"
 */

/**
 * Which service actually answers.
 *
 * "hermes"    — a hermes-agent api_server behind hermes-gateway.
 * "mi-report" — the mi-report FastAPI app, which owns the MI corpus and its own
 *               retrieval stack. Its stream is translated to hermes-shaped
 *               events server-side (src/lib/mi-report.ts), so the UI sees one
 *               protocol either way.
 */
export type Backend = "hermes" | "mi-report";

export interface AgentDef {
  /** URL segment and stable key. */
  slug: string;
  label: string;
  blurb: string;
  backend: Backend;
  /** Gateway upstream name — pinned on every request of a run. Hermes only. */
  upstream: string;
  /** Model id sent in the run body. Hermes only. */
  model: string;
  /** Prompts offered as starting points in an empty workspace. */
  starters: string[];
}

export const AGENTS: AgentDef[] = [
  {
    slug: "mi-report",
    label: "MI 리포트",
    blurb: "수집된 코퍼스를 근거로 시장·경쟁사 동향에 답합니다.",
    // Routed to the mi-report app, not the bare hermes profile: the corpus,
    // retrieval and wiki all live there. `upstream`/`model` are the fallback
    // used when that backend is unreachable.
    backend: "mi-report",
    upstream: "mi-report",
    model: "mi-report",
    starters: [
      "이번 주 수집된 문서에서 주목할 시장 신호를 정리해 줘.",
      "경쟁사 최근 공시·뉴스에서 우리 영업에 영향 있는 내용만 추려 줘.",
      "고객사 A 관련해 코퍼스에 뭐가 있는지 근거와 함께 알려 줘.",
    ],
  },
  {
    slug: "contract",
    label: "계약서 분석",
    blurb: "계약서를 조항 단위로 읽고 불리한 조항·누락 조항·협상 포인트를 짚어 줍니다.",
    backend: "hermes",
    upstream: "contract-review",
    model: "contract-review",
    starters: [
      "첨부한 계약서를 을(자사) 관점에서 검토해 줘.",
      "해지·손해배상·지연배상 조항만 심각도 순으로 정리해 줘.",
      "있어야 하는데 빠진 조항이 뭔지 짚어 줘.",
    ],
  },
  {
    slug: "account",
    label: "고객관리",
    blurb: "미팅 노트·파이프라인을 정리하고 다음 액션을 제안합니다.",
    backend: "hermes",
    upstream: "agent-cowork",
    model: "agent-cowork",
    starters: [
      "오늘 미팅 노트를 정리하고 후속 액션을 뽑아 줘.",
      "이번 주 파이프라인에서 정체된 딜과 그 이유를 정리해 줘.",
      "고객사 담당자에게 보낼 후속 메일 초안을 써 줘.",
    ],
  },
];

export function findAgent(slug: string): AgentDef | undefined {
  return AGENTS.find((a) => a.slug === slug);
}
