/**
 * The workspace roster — one entry per job the sales team actually does.
 *
 * ## What shapes this list
 *
 * Not the backends, and not a generic B2B funnel. This is a component
 * distribution sales team: alongside new-logo work they run 판매계획 and 목표
 * 배분, 물량 배분과 재고, 마크업과 특가, Design-win 추적, 단종(EOL)·제품변경
 * (PCN)·클레임(RMA) 대응, 그리고 주간 판매회의 보고. The roster follows those
 * domains, in the order `playbooks.ts` lists them, because that is the order the
 * work is organised in the team's own head.
 *
 * Most workspaces run on **one hermes profile, `sales-agent`**, whose
 * `skills/sales/` directory holds the real operating rules. One profile rather
 * than twenty keeps skills, memory and model config in a single place; the
 * `instructions` field is what points each workspace at its own playbook —
 * hermes takes it as an ephemeral system prompt per run. Without it a shared
 * profile would have to guess intent from the user's phrasing, which is exactly
 * what it gets wrong.
 *
 * Adding a workspace is editing this list. There is no orchestration layer here
 * to teach about a new agent, because the orchestration lives inside hermes.
 *
 * `upstream` must match a key in the gateway's HERMES_UPSTREAMS, and `model` an
 * id from GET /v1/models. Verify with:
 *   curl -s localhost:8700/v1/models -H "Authorization: Bearer $KEY"
 */

import { PLAYBOOKS } from "./playbooks";

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

/**
 * Nav groups, in nav order. These are the team's work domains, not deal stages:
 * a deal-stage nav would have no place to put 재고 운용 or PCN 대응, which is
 * how those playbooks went unreachable in the first place.
 */
export const STAGES = [
  "시장·고객 조사",
  "판매전략",
  "신규수요 창출",
  "딜 진행",
  "계약",
  "물량·품질 운영",
  "고객 관리",
] as const;

export type Stage = (typeof STAGES)[number];

export interface AgentDef {
  /** URL segment and stable key. */
  slug: string;
  label: string;
  blurb: string;
  /** Nav grouping — a work domain from STAGES. */
  stage: Stage;
  backend: Backend;
  /** Gateway upstream name — pinned on every request of a run. Hermes only. */
  upstream: string;
  /** Model id sent in the run body. Hermes only. */
  model: string;
  /**
   * Playbooks this workspace reaches for, by skill name. Declared rather than
   * left implicit in `instructions` so a renamed playbook fails
   * `agents.test.ts` instead of silently degrading the answer. See
   * `playbooks.ts` for why that failure mode is invisible at runtime.
   */
  playbooks: readonly string[];
  /**
   * Per-run system prompt. Points a shared profile at this workspace's
   * playbook, and carries the one discipline that playbook is most often
   * wanted for.
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

/** The shared sales profile. Every workspace but MI, 계약서 분석, 현황진단. */
const SALES = {
  backend: "hermes",
  upstream: "sales-agent",
  model: "sales-agent",
} as const;

export const AGENTS: AgentDef[] = [
  // ── 시장·고객 조사 ──────────────────────────────────────────────────────
  {
    slug: "mi-report",
    label: "MI 리포트",
    blurb: "수집된 코퍼스를 근거로 시장·경쟁사 동향에 답합니다.",
    stage: "시장·고객 조사",
    // Routed to the mi-report app, not the bare hermes profile: the corpus,
    // retrieval and wiki all live there. `upstream`/`model` are the fallback
    // used when that backend is unreachable.
    backend: "mi-report",
    upstream: "mi-report",
    model: "mi-report",
    playbooks: [],
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
    slug: "market",
    label: "시황·시장규모",
    blurb: "수요·공급·가격 동향을 관측과 해석으로 나눠 정리하고, TAM/SAM/SOM을 산정합니다.",
    ...SALES,
    stage: "시장·고객 조사",
    playbooks: ["market-trend-brief", "market-sizing"],
    instructions:
      "시황·가격 동향 정리 요청이면 `market-trend-brief` 스킬을, 시장 규모 산정 " +
      "요청이면 `market-sizing` 스킬을 읽고 그 규칙에 따른다. 관측한 숫자와 그 " +
      "해석을 반드시 나눠 쓰고, 시장 규모는 정의를 먼저 고정한 뒤 하향식·상향식 " +
      "두 가지로 계산해 대조한다. 추정치로 표를 채우지 않는다.",
    starters: [
      "이번 주 시황을 정리해 줘. 우리 판매에 무슨 뜻인지까지 써 줘.",
      "이 지역·용도의 시장 규모를 TAM/SAM/SOM으로 산정해 줘.",
      "가격 협상 전에 알아야 할 원가·수급 변수를 정리해 줘.",
    ],
  },
  {
    slug: "account-brief",
    label: "고객사 브리핑",
    blurb: "첫 미팅 전 사전 조사를 한 장으로 정리하고, 물어볼 질문으로 끝냅니다.",
    ...SALES,
    stage: "시장·고객 조사",
    playbooks: ["account-brief"],
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

  // ── 판매전략 ───────────────────────────────────────────────────────────
  {
    slug: "sales-plan",
    label: "목표·판매계획",
    blurb: "연간 목표를 경영계획과 도전계획으로 나누고, 기간 계획을 고객·제품별로 배분합니다.",
    ...SALES,
    stage: "판매전략",
    playbooks: ["sales-target-setting", "sales-plan"],
    instructions:
      "연간 목표 수립 요청이면 `sales-target-setting` 스킬을, 기간 판매계획·목표 " +
      "배분 요청이면 `sales-plan` 스킬을 읽고 그 규칙에 따른다. 경영계획과 " +
      "도전계획은 서로 다른 기준으로 근거를 세우고 두 목표의 차이를 무엇으로 " +
      "메울지 명시한다. 계획에는 전제와 미달 시 대안을 반드시 함께 적는다.",
    starters: [
      "내년 경영계획과 도전계획을 나눠서 세워 줘.",
      "이번 분기 목표를 고객별로 배분해 줘.",
      "상위에서 내려온 할당과 현장 집계가 안 맞아. 차이를 정리해 줘.",
    ],
  },
  {
    slug: "execution",
    label: "판매 실행관리",
    blurb: "연정망·16주 GC·속보를 만들고, 계획 대비 갭을 원인별로 분류해 회복 계획까지 붙입니다.",
    ...SALES,
    stage: "판매전략",
    playbooks: ["sales-execution-tracking"],
    instructions:
      "`sales-execution-tracking` 스킬을 읽고 그 규칙에 따라 답한다. 계획 대비 " +
      "미달은 원인별로 분류하고 각각에 회복 계획을 붙인다. 수급표와 진척 숫자는 " +
      "자료에 없으면 추정으로 채우지 말고 `확인되지 않음`으로 남긴다.",
    starters: [
      "이번 주 판매 속보를 만들어 줘.",
      "계획 대비 미달분을 원인별로 나누고 회복 계획을 붙여 줘.",
      "이 요청 물량을 우리가 이행할 수 있는지 확인해 줘.",
    ],
  },
  {
    slug: "pricing",
    label: "가격·마크업",
    blurb: "기준가와 마크업을 설계하고, 협상을 준비하고, 특가 이후의 마진을 검증합니다.",
    ...SALES,
    stage: "판매전략",
    playbooks: ["pricing-strategy", "markup-policy"],
    instructions:
      "가격 정책·협상 준비·시장가 센싱이면 `pricing-strategy` 스킬을, 매입가에서 " +
      "판가까지의 마크업 구조·예외 단가 승인이면 `markup-policy` 스킬을 읽고 그 " +
      "규칙에 따른다. **양보에는 반드시 대가를 붙인다.** 경쟁사와의 가격 정보 " +
      "교환은 어떤 형태로도 제안하지 않는다. 최종 단가를 대신 확정하지 않는다.",
    starters: [
      "이 고객 가격 협상을 준비해 줘. 양보 카드와 그 대가를 짝지어 줘.",
      "이 품목의 마크업 기준을 세워 줘.",
      "특가 지원 이후 실제 마진이 얼마 남는지 검증해 줘.",
    ],
  },
  {
    slug: "reporting",
    label: "판매회의·업무보고",
    blurb: "회의 대응 자료와 현장 업무보고를 만듭니다. 나쁜 숫자를 먼저 꺼냅니다.",
    ...SALES,
    stage: "판매전략",
    playbooks: ["sales-meeting-report"],
    instructions:
      "`sales-meeting-report` 스킬을 읽고 그 규칙에 따라 답한다. 사실과 해석과 " +
      "요청을 분리하고, 나쁜 숫자를 앞에 놓는다. 요청이 없는 보고는 만들지 않는다.",
    starters: [
      "이번 주 판매회의 대응 자료를 만들어 줘.",
      "고객 방문 결과를 업무보고로 정리해 줘.",
      "지난 회의에서 받은 지적의 후속 조치를 정리해 줘.",
    ],
  },

  // ── 신규수요 창출 ──────────────────────────────────────────────────────
  {
    slug: "demand",
    label: "신규수요 발굴",
    blurb: "신규 고객·용도·채널과 지역별 진입 후보를 물량 추정과 함께 세웁니다.",
    ...SALES,
    stage: "신규수요 창출",
    playbooks: ["demand-generation", "territory-prospecting"],
    instructions:
      "신규 고객·용도·채널 발굴이면 `demand-generation` 스킬을, 지역 단위 진입 " +
      "검토면 `territory-prospecting` 스킬을 읽고 그 규칙에 따른다. 후보마다 진입 " +
      "장벽과 승인 리드타임을 물량 추정과 함께 적고, 지역은 운임을 포함한 원가로 " +
      "진입 가능 여부를 먼저 판정한다.",
    starters: [
      "기존 고객만으로 목표가 안 나와. 신규 수요 후보를 세워 줘.",
      "이 재고를 소진할 새 판로를 찾아 줘.",
      "어느 지역부터 열어야 할지 우선순위를 정해 줘.",
    ],
  },
  {
    slug: "design-win",
    label: "Design-win·샘플",
    blurb: "설계 진입부터 양산까지 단계를 증빙으로 판정하고, 샘플 결과를 회수해 잇습니다.",
    ...SALES,
    stage: "신규수요 창출",
    playbooks: [
      "design-win-management",
      "competitive-conversion",
      "sample-management",
    ],
    instructions:
      "설계 진입·채택·양산 단계 관리면 `design-win-management` 스킬을, 경쟁사 " +
      "품번 대체면 `competitive-conversion` 스킬을, 샘플 요청·발송·결과 회수면 " +
      "`sample-management` 스킬을 읽고 그 규칙에 따른다. 단계는 증빙으로만 " +
      "판정하고, 호환 수준을 검증 없이 단정하지 않는다.",
    starters: [
      "이 설계 건이 지금 어느 단계인지 증빙으로 판정해 줘.",
      "채택은 됐는데 물량이 안 나와. 원인을 짚어 줘.",
      "경쟁 품번을 우리 것으로 바꿀 근거를 전환 비용까지 계산해 줘.",
    ],
  },
  {
    slug: "promotion",
    label: "판촉·딜등록",
    blurb: "판촉·특가 프로그램을 종료 조건까지 설계하고, 공급사 딜 등록을 만료 없이 관리합니다.",
    ...SALES,
    stage: "신규수요 창출",
    playbooks: ["promotion-program", "sales-code-registration"],
    instructions:
      "판촉·특가 프로그램이면 `promotion-program` 스킬을, 공급사 딜 등록(Sales " +
      "Code)이면 `sales-code-registration` 스킬을 읽고 그 규칙에 따른다. 판촉은 " +
      "목표를 물량이 아니라 행동으로 정의하고 **종료 조건과 종료 후 가격을 먼저** " +
      "정한다. 등록은 유효기간을 실제 수주 진행과 대조해 만료로 잃는 건이 없게 한다.",
    starters: [
      "이 신규 품목 확산용 판촉 프로그램을 설계해 줘.",
      "특가 프로그램 효과를 기준선과 비교해 검증해 줘.",
      "딜 등록 현황을 점검하고 만료 임박 건을 뽑아 줘.",
    ],
  },

  // ── 딜 진행 ────────────────────────────────────────────────────────────
  {
    slug: "discovery",
    label: "미팅 정리",
    blurb: "미팅 메모를 디스커버리 기록으로 정리하고, 자격 심사와 팔로업 메일까지 잇습니다.",
    ...SALES,
    stage: "딜 진행",
    playbooks: ["discovery-notes", "followup-email", "deal-qualification"],
    instructions:
      "미팅 메모 정리면 `discovery-notes` 스킬을, 메일 초안이면 `followup-email` " +
      "스킬을, 딜 전체의 자격 심사(MEDDIC/BANT)면 `deal-qualification` 스킬을 읽고 " +
      "그 규칙에 따른다. 메모에 근거가 없는 항목은 반드시 `미확인`으로 남기고 " +
      "추측으로 채우지 않는다. 자격 심사는 점수를 매기는 것이 목적이 아니라 " +
      "빈 칸을 메울 질문으로 끝내는 것이다.",
    starters: [
      "오늘 미팅 메모를 디스커버리 기록으로 정리해 줘.",
      "정리한 내용으로 팔로업 메일 초안을 써 줘.",
      "이 딜을 MEDDIC으로 정리하고 빈 칸을 짚어 줘.",
    ],
  },
  {
    slug: "proposal",
    label: "제안서",
    blurb: "디스커버리에서 확인된 내용만으로 제안서 골격을 잡습니다.",
    ...SALES,
    stage: "딜 진행",
    playbooks: ["proposal-outline"],
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
    slug: "competitive",
    label: "경쟁·반론 대응",
    blurb: "경쟁사 배틀카드를 한 장으로 만들고, 가격·보안·타이밍 반론 화법을 준비합니다.",
    ...SALES,
    stage: "딜 진행",
    playbooks: ["competitive-battlecard", "objection-handling"],
    instructions:
      "경쟁사 비교·대응이면 `competitive-battlecard` 스킬을, 고객 반론 대응이면 " +
      "`objection-handling` 스킬을 읽고 그 규칙에 따른다. 배틀카드는 확인된 사실과 " +
      "추정을 구분하고 한 장 분량을 지킨다. 반론은 이기려 들지 말고 " +
      "인정-재구성-근거 구조로 답한다.",
    starters: [
      "A사와 붙었어. 배틀카드를 만들어 줘.",
      "비싸다는 반론에 어떻게 답해야 할지 화법을 만들어 줘.",
      "보안팀에서 걸렸다는데 대응 논리를 정리해 줘.",
    ],
  },
  {
    slug: "pipeline",
    label: "딜·파이프라인",
    blurb: "딜 하나의 위험 신호와 파이프라인 전체의 정체 구간을 점검합니다.",
    ...SALES,
    stage: "딜 진행",
    playbooks: ["deal-risk-review", "pipeline-hygiene"],
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

  // ── 계약 ───────────────────────────────────────────────────────────────
  {
    slug: "contract",
    label: "계약서 분석",
    blurb: "계약서를 조항 단위로 읽고 불리한 조항·누락 조항·협상 포인트를 짚어 줍니다.",
    ...SALES,
    stage: "계약",
    // Was its own hermes profile with a dedicated SOUL.md. That profile ran a
    // second process, port and credential for a single workspace, and said
    // almost exactly what the shared `contract-review` playbook already says —
    // the two had converged independently. Pointing this workspace at the
    // shared profile the same way the other nineteen do produced an equivalent
    // review on the same test contract, so the extra profile earned nothing.
    instructions:
      "`contract-review` 스킬을 읽고 그 규칙에 따라 답한다. 을(자사) 관점으로 " +
      "검토하고, 모든 지적에 조항 번호와 원문 인용을 붙이며, 없어서 문제인 " +
      "조항은 '누락'으로 따로 짚는다. 법률 자문이 아니라 협상 준비다.",
    playbooks: ["contract-review"],
    starters: [
      "첨부한 계약서를 을(자사) 관점에서 검토해 줘.",
      "해지·손해배상·지연배상 조항만 심각도 순으로 정리해 줘.",
      "있어야 하는데 빠진 조항이 뭔지 짚어 줘.",
    ],
  },
  {
    slug: "contract-plan",
    label: "협상 대책",
    blurb: "검토 결과를 수정안·후퇴선·제시 순서로 바꾸고, 어디서 멈출지 정합니다.",
    ...SALES,
    stage: "계약",
    // 검토(무엇이 문제인가)와 대책(그래서 무엇을 할 것인가)을 나눈 이유: 한 화면에서
    // 둘을 함께 시키면 위험 조항 나열에 밀려 후퇴선과 승인 한도가 늘 빠졌다.
    instructions:
      "`contract-countermeasure` 스킬을 읽고 그 규칙에 따라 답한다. 조항을 " +
      "필수·교환·수용으로 나누고, 필수는 셋을 넘기지 않는다. 후퇴선은 " +
      "최초안·1차 후퇴·최종선 세 단계로 만들고 숫자에는 반드시 근거를 붙인다. " +
      "근거를 못 대면 지어내지 말고 `근거 필요`로 남겨 사내 확인 사항에 올린다. " +
      "양보에는 항상 대가를 짝지어 제시한다.",
    playbooks: ["contract-countermeasure"],
    starters: [
      "검토 결과를 바탕으로 협상 대책을 세워 줘. 필수·교환·수용으로 나눠서.",
      "지연배상과 책임 상한 조항의 후퇴선을 단계로 만들어 줘.",
      "상대에게 보낼 수정 요청 회신 문안을 써 줘.",
    ],
  },
  {
    slug: "contract-draft",
    label: "계약서 작성",
    blurb: "합의된 조건을 조항으로 옮기고, 빠지면 분쟁이 되는 조항을 갖춰 초안을 만듭니다.",
    ...SALES,
    stage: "계약",
    instructions:
      "`contract-drafting` 스킬을 읽고 그 규칙에 따라 답한다. **확정되지 않은 " +
      "값은 절대 채우지 말고 `[  ]`로 비워 두고 문서 끝 '확정 필요' 목록에 " +
      "모은다** — 초안의 숫자는 검토를 거치며 합의된 값처럼 굳는다. 책임 상한, " +
      "지연배상 상한, 검수 기준, IP 귀속, 준거법·분쟁해결은 기본으로 넣는다. " +
      "우리가 독소조항이라 부르는 것을 우리가 쓰지 않는다.",
    playbooks: ["contract-drafting"],
    starters: [
      "합의한 조건으로 공급계약서 초안을 만들어 줘.",
      "상호 NDA 초안을 써 줘. 목적과 기간은 아직 미정이야.",
      "이번 변경 사항으로 부속합의서를 작성해 줘.",
    ],
  },
  {
    slug: "contract-ops",
    label: "계약 운영",
    blurb: "만료·갱신 시점과 단가표 유효기간을 관리하고, 수량 약정 이행을 실적과 대조합니다.",
    ...SALES,
    stage: "계약",
    playbooks: ["contract-operations"],
    instructions:
      "`contract-operations` 스킬을 읽고 그 규칙에 따라 답한다. 체결된 계약의 " +
      "운영이 대상이고, 초안 검토는 여기서 하지 않는다. 갱신 협상 전에 수량 약정과 " +
      "조건 이행을 실적과 대조해 결산하고, 자동 연장 조항을 반드시 확인한다.",
    starters: [
      "만료·갱신이 임박한 계약을 뽑아 줘.",
      "이 계약의 수량 약정 이행을 실적과 대조해 줘.",
      "단가표 유효기간이 지난 건이 있는지 점검해 줘.",
    ],
  },

  // ── 물량·품질 운영 ─────────────────────────────────────────────────────
  {
    slug: "supply",
    label: "물량·재고 운용",
    blurb: "가용 물량과 수요를 맞추고, 적정 재고를 산정하고, 선행 확보 결정을 검토합니다.",
    ...SALES,
    stage: "물량·품질 운영",
    playbooks: [
      "supply-allocation",
      "inventory-management",
      "strategic-volume-ops",
    ],
    instructions:
      "물량 배분·수급 대조면 `supply-allocation` 스킬을, 적정·부진 재고면 " +
      "`inventory-management` 스킬을, 확정 주문 전 물량 확보(Capa·선행 생산·" +
      "safety stock PO·Risk PO)면 `strategic-volume-ops` 스킬을 읽고 그 규칙에 " +
      "따른다. **고객에게 물량을 확약하지 않는다** — 초안까지만 만들고 배분 근거를 " +
      "명시한다. 선행 확보는 근거·리스크 한도·책임 소재를 반드시 함께 적는다.",
    starters: [
      "이번 달 물량을 고객별로 어떻게 나눠야 할지 근거와 함께 짜 줘.",
      "이 긴급 추가 요청을 받을 수 있는지 검토해 줘.",
      "부진 재고를 연령과 원인별로 분류하고 처리안을 만들어 줘.",
    ],
  },
  {
    slug: "logistics",
    label: "출하·물류",
    blurb: "인도 조건과 서류를 출하 전에 확정하고, 지연·오출하 시 고객 통보와 복구를 묶어 처리합니다.",
    ...SALES,
    stage: "물량·품질 운영",
    playbooks: ["logistics-support"],
    instructions:
      "`logistics-support` 스킬을 읽고 그 규칙에 따라 답한다. 지연·오출하·파손은 " +
      "복구 조치와 고객 통보를 함께 처리하고, 통보 문안에는 확인된 사실만 쓴다. " +
      "새 납기를 임의로 약속하지 않는다.",
    starters: [
      "납기가 밀렸어. 고객 통보문과 복구 계획을 같이 만들어 줘.",
      "이 건의 인도 조건과 필요한 서류를 정리해 줘.",
      "긴급 출하 요청을 어떻게 처리할지 정리해 줘.",
    ],
  },
  {
    slug: "quality",
    label: "클레임·EOL·PCN",
    blurb: "반품·단종·제품변경 통지를 받아 고객 영향을 판정하고 회신 기한까지 관리합니다.",
    ...SALES,
    stage: "물량·품질 운영",
    playbooks: ["rma-handling", "eol-management", "pcn-management"],
    instructions:
      "고객 클레임·반품이면 `rma-handling` 스킬을, 단종 통지·LTB면 " +
      "`eol-management` 스킬을, 제품 변경 통지면 `pcn-management` 스킬을 읽고 그 " +
      "규칙에 따른다. 클레임은 원인 판정 전에 고객 라인을 세우는 조치를 먼저 " +
      "내고, **책임 판단을 대신 내리지 않는다.** 영향 고객은 로트가 아니라 승인 " +
      "이력으로 찾고, 회신 기한을 놓치지 않게 일정을 함께 남긴다.",
    starters: [
      "고객 라인이 섰어. 지금 해야 할 조치를 순서대로 정리해 줘.",
      "이 단종 통지의 영향 고객과 LTB 물량을 산정해 줘.",
      "이 PCN이 재승인 대상인지 고객 승인 범위와 대조해 줘.",
    ],
  },

  // ── 고객 관리 ──────────────────────────────────────────────────────────
  {
    slug: "customer",
    label: "고객 프로파일·내방",
    blurb: "조직·구매 절차·거래 조건을 한 곳에 모으고, 내방과 선물·접대를 규정 안에서 준비합니다.",
    ...SALES,
    stage: "고객 관리",
    playbooks: [
      "customer-profile",
      "customer-visit-hosting",
      "business-courtesy",
    ],
    instructions:
      "고객 등록·갱신·인수인계면 `customer-profile` 스킬을, 고객 내방·감사 대응이면 " +
      "`customer-visit-hosting` 스킬을, 선물·접대 검토면 `business-courtesy` 스킬을 " +
      "읽고 그 규칙에 따른다. 접대는 **금지 대상과 금지 시점을 먼저 판정**하고, " +
      "금액 기준은 사내 규정에서 가져온다 — 임의로 정하지 않는다. 내방은 보여줄 " +
      "것과 보여주지 않을 것을 미리 나눈다.",
    starters: [
      "이 고객 프로파일을 만들어 줘. 인계받을 자료를 정리하는 중이야.",
      "다음 주 고객 내방 일정을 목적에서 역산해 짜 줘.",
      "이 시점에 이 고객에게 명절 선물을 보내도 되는지 판정해 줘.",
    ],
  },
  {
    slug: "qbr",
    label: "분기 리뷰 (QBR)",
    blurb: "지난 분기 약속 이행을 먼저 결산하고, 다음 분기 상호 실행 항목으로 끝냅니다.",
    ...SALES,
    stage: "고객 관리",
    playbooks: ["qbr-review"],
    instructions:
      "`qbr-review` 스킬을 읽고 그 규칙에 따라 답한다. 지난 분기의 약속 이행을 " +
      "먼저 결산하고, 나쁜 숫자를 앞에 놓는다. 우리 쪽 실행 항목 없이 고객 " +
      "요구만 적은 자료는 만들지 않는다.",
    starters: [
      "이 고객과의 분기 리뷰 자료를 만들어 줘.",
      "지난 분기에 우리가 한 약속의 이행 여부를 결산해 줘.",
      "공급사와의 분기 리뷰를 준비해 줘.",
    ],
  },
  {
    slug: "global",
    label: "MNC·해외법인",
    blurb: "지역별로 어디서 무엇이 결정되는지 지도를 만들고, 본사–법인 역할 경계를 정리합니다.",
    ...SALES,
    stage: "고객 관리",
    playbooks: ["global-account-management", "overseas-operations"],
    instructions:
      "다국적 고객(MNC) 관리면 `global-account-management` 스킬을, 우리 쪽 해외 " +
      "법인 운영·해외 출장이면 `overseas-operations` 스킬을 읽고 그 규칙에 따른다. " +
      "지역 간 가격 일관성과 기여 인정 규칙을 먼저 정하고, 설계처와 구매처가 " +
      "다른 경우를 명시적으로 구분한다.",
    starters: [
      "이 고객의 지역별 의사결정 구조를 지도로 만들어 줘.",
      "지역 간 단가 차이를 어떻게 정리할지 검토해 줘.",
      "다음 달 해외 출장을 목적에서 역산해 준비해 줘.",
    ],
  },
  {
    slug: "diagnosis",
    label: "영업 현황진단",
    blurb: "실적 자료를 넣으면 채널별 진단·지표·전략 3축·Action Items를 인용과 함께 만듭니다.",
    // Sits in 판매전략, not 고객 관리: it reads performance data and comes back
    // with channel diagnosis and strategy, which is the same job as the weekly
    // sales meeting pack next to it. Grouping it under account management put a
    // performance tool in with relationship work and left neither group
    // coherent.
    stage: "판매전략",
    // Routed to the marketing-agent harness. Ten agents with verbatim-quote
    // grounding already live there; `upstream`/`model` are unused for this
    // backend and kept only so the roster type stays uniform.
    backend: "marketing-agent",
    upstream: "marketing-agent",
    model: "marketing-agent",
    playbooks: [],
    starters: [
      "이번 달 채널별 실적 자료를 붙여넣고 현황진단을 받아 보세요.",
    ],
  },
];

/** Nav order within a stage follows roster order. */
export function agentsByStage(stage: Stage): AgentDef[] {
  return AGENTS.filter((a) => a.stage === stage);
}

export function findAgent(slug: string): AgentDef | undefined {
  return AGENTS.find((a) => a.slug === slug);
}

/** Every playbook named by some workspace. Asserted against PLAYBOOKS in tests. */
export function referencedPlaybooks(): string[] {
  return [...new Set(AGENTS.flatMap((a) => a.playbooks))].sort();
}

/** Playbooks in the manifest that no workspace can reach. Should be empty. */
export function unreachablePlaybooks(): string[] {
  const reached = new Set(AGENTS.flatMap((a) => a.playbooks));
  return PLAYBOOKS.filter((p) => !reached.has(p));
}
