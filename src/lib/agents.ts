/**
 * The agent roster — one entry per stage of the sales cycle.
 *
 * The shape follows the standard B2B sales process (리드 검증 → 미팅 준비 →
 * 디스커버리 → 제안 → 협상·계약 → 딜 관리 → 사후 팔로업) rather than the shape of
 * the backends, because that is the order the work actually happens in.
 *
 * Six of these run on one hermes profile, `sales-agent`, whose `skills/sales/`
 * directory holds the real operating rules (account-brief, discovery-notes,
 * proposal-outline, deal-risk-review, pipeline-hygiene, followup-email, and
 * customer-data-handling, which governs all of them). One profile rather than
 * six keeps the skills, memory and model config in a single place; the
 * `instructions` field below is what points each workspace at its skill —
 * hermes takes it as an ephemeral system prompt per run.
 *
 * Adding a workspace is editing this list. There is no orchestration layer here
 * to teach about a new agent, because the orchestration lives inside hermes.
 *
 * `upstream` must match a key in the gateway's HERMES_UPSTREAMS, and `model` an
 * id from GET /v1/models. Verify with:
 *   curl -s localhost:8700/v1/models -H "Authorization: Bearer $KEY"
 */

/**
 * Which service actually answers.
 *
 * "hermes"          — a hermes-agent api_server behind hermes-gateway.
 * "mi-report"       — the mi-report FastAPI app, which owns the MI corpus and
 *                     its own retrieval stack.
 * "marketing-agent" — the marketing-agent harness, ten agents that turn raw
 *                     sales/marketing material into a cited diagnosis.
 *
 * Only hermes speaks the run-event protocol natively. The other two are
 * translated to hermes-shaped events server-side (src/lib/mi-report.ts,
 * src/lib/marketing-agent.ts) so the UI only ever sees one protocol.
 */
export type Backend = "hermes" | "mi-report" | "marketing-agent";

export interface AgentDef {
  /** URL segment and stable key. */
  slug: string;
  label: string;
  blurb: string;
  /** Sales-cycle grouping, used to order and head the nav. */
  stage: "조사" | "영업 실행" | "계약" | "관리";
  backend: Backend;
  /** Gateway upstream name — pinned on every request of a run. Hermes only. */
  upstream: string;
  /** Model id sent in the run body. Hermes only. */
  model: string;
  /**
   * Per-run system prompt. Points a shared profile at this workspace's skill so
   * six workspaces can share one agent without each having to guess intent from
   * the user's phrasing.
   */
  instructions?: string;
  /** Prompts offered as starting points in an empty workspace. */
  starters: string[];
  /**
   * One-click jobs that are not a chat turn. Currently only mi-report has one:
   * its weekly-report pipeline, which is a different endpoint from chat.
   */
  actions?: { id: "report"; label: string; hint: string }[];
}

const SALES = {
  stage: "영업 실행",
  backend: "hermes",
  upstream: "sales-agent",
  model: "sales-agent",
} as const;

export const AGENTS: AgentDef[] = [
  {
    slug: "mi-report",
    label: "MI 리포트",
    blurb: "수집된 코퍼스를 근거로 시장·경쟁사 동향에 답합니다.",
    stage: "조사",
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
    actions: [
      {
        id: "report",
        label: "주간 리포트 생성",
        hint: "다이제스트 · 주제 요약 · 총평 · 근거 검증까지 돌립니다 (수 분 소요)",
      },
    ],
  },
  {
    slug: "account-brief",
    label: "고객사 브리핑",
    blurb: "첫 미팅 전 사전 조사를 한 장으로 정리하고, 물어볼 질문으로 끝냅니다.",
    ...SALES,
    stage: "조사",
    instructions:
      "`account-brief` 스킬을 읽고 그 규칙에 따라 답한다. " +
      "공개 정보로 알 수 있는 것과 알 수 없는 것을 반드시 구분하고, " +
      "미팅에서 물어야 할 질문 목록으로 끝낸다.",
    starters: [
      "OO전자와 첫 미팅이 있어. 사전 브리프 만들어 줘.",
      "이 회사 최근 실적·조직 변화·업계 위치를 정리해 줘.",
      "미팅에서 꼭 물어봐야 할 걸 뽑아 줘.",
    ],
  },
  {
    slug: "discovery",
    label: "미팅 정리",
    blurb: "미팅 메모를 디스커버리 기록으로 정리하고 팔로업 메일까지 씁니다.",
    ...SALES,
    instructions:
      "미팅 메모 정리 요청이면 `discovery-notes` 스킬을, 메일 초안 요청이면 " +
      "`followup-email` 스킬을 읽고 그 규칙에 따른다. 메모에 근거가 없는 항목은 " +
      "반드시 `미확인`으로 남기고 추측으로 채우지 않는다.",
    starters: [
      "오늘 미팅 메모를 디스커버리 기록으로 정리해 줘.",
      "정리한 내용으로 팔로업 메일 초안을 써 줘.",
      "이번 미팅에서 확인 못 한 게 뭐지?",
    ],
  },
  {
    slug: "proposal",
    label: "제안서",
    blurb: "디스커버리에서 확인된 내용만으로 제안서 골격을 잡습니다.",
    ...SALES,
    instructions:
      "`proposal-outline` 스킬을 읽고 그 규칙에 따라 답한다. 제안서는 우리 회사 " +
      "소개가 아니라 고객의 문제에서 시작한다. 근거가 없는 절은 비워 두고 " +
      "무엇을 더 확인해야 채울 수 있는지 적는다.",
    starters: [
      "이 디스커버리 내용으로 제안서 목차를 잡아 줘.",
      "RFP 요구사항에 맞춰 답변 구조를 짜 줘.",
      "제안서에서 아직 근거가 부족한 절이 어디야?",
    ],
  },
  {
    slug: "contract",
    label: "계약서 분석",
    blurb: "계약서를 조항 단위로 읽고 불리한 조항·누락 조항·협상 포인트를 짚어 줍니다.",
    stage: "계약",
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
    slug: "diagnosis",
    label: "영업 현황진단",
    blurb: "실적 자료를 넣으면 채널별 진단·지표·전략 3축·Action Items를 인용과 함께 만듭니다.",
    stage: "관리",
    // Routed to the marketing-agent harness. Ten agents with verbatim-quote
    // grounding already live there; `upstream`/`model` are unused for this
    // backend and kept only so the roster type stays uniform.
    backend: "marketing-agent",
    upstream: "marketing-agent",
    model: "marketing-agent",
    starters: [
      "이번 달 채널별 실적 자료를 붙여넣고 현황진단을 받아 보세요.",
    ],
  },
  {
    slug: "pipeline",
    label: "딜·파이프라인",
    blurb: "딜 하나의 위험 신호와 파이프라인 전체의 정체 구간을 점검합니다.",
    ...SALES,
    stage: "관리",
    instructions:
      "딜 하나를 묻는 요청이면 `deal-risk-review` 스킬을, 파이프라인 전체를 " +
      "훑는 요청이면 `pipeline-hygiene` 스킬을 읽고 그 규칙에 따른다. " +
      "낙관 편향을 걷어내되, 모든 지적에는 입력에 있는 근거를 붙인다.",
    starters: [
      "이 딜 성사 가능성이 어때? 깨진다면 어디서 깨질까?",
      "파이프라인에서 정체된 딜과 그 이유를 정리해 줘.",
      "이번 분기 예측에서 걷어내야 할 딜이 뭐야?",
    ],
  },
];

/** Nav order — sales-cycle order, not roster order. */
export const STAGES: AgentDef["stage"][] = ["조사", "영업 실행", "계약", "관리"];

export function findAgent(slug: string): AgentDef | undefined {
  return AGENTS.find((a) => a.slug === slug);
}
