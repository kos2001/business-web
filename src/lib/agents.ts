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

export interface AgentDef {
  /** URL segment and stable key. */
  slug: string;
  label: string;
  blurb: string;
  /** Gateway upstream name — pinned on every request of a run. */
  upstream: string;
  /** Model id sent in the run body. */
  model: string;
  /** Prompts offered as starting points in an empty workspace. */
  starters: string[];
}

export const AGENTS: AgentDef[] = [
  {
    slug: "mi-report",
    label: "MI 리포트",
    blurb: "시장·경쟁사 동향을 조사해 보고서 초안까지 만듭니다.",
    upstream: "mi-report",
    model: "mi-report",
    starters: [
      "이번 분기 주요 경쟁사 동향을 정리해 줘.",
      "고객사 A의 최근 공시와 뉴스를 근거로 MI 리포트 초안을 작성해 줘.",
      "지난 리포트 대비 이번 달에 달라진 시장 신호만 추려 줘.",
    ],
  },
  {
    slug: "contract",
    label: "계약서 분석",
    blurb: "계약서를 파싱해 조항·리스크를 근거와 함께 짚어 줍니다.",
    upstream: "doc-parser",
    model: "doc-parser",
    starters: [
      "이 계약서에서 우리에게 불리한 조항을 인용과 함께 짚어 줘.",
      "해지·손해배상·지연배상 조항을 표로 정리해 줘.",
      "표준 계약서 대비 달라진 부분만 뽑아 줘.",
    ],
  },
  {
    slug: "account",
    label: "고객관리",
    blurb: "미팅 노트·파이프라인을 정리하고 다음 액션을 제안합니다.",
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
