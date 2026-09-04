/**
 * Turning hermes tool names into something a salesperson can read.
 *
 * The run stream names tools the way the agent runtime does — `skill_view`,
 * `read_file`, `terminal`, `docparser_hybrid_search`. To the person waiting on
 * a contract review those are noise at best; at worst `terminal` reads as
 * something going wrong. But hiding the trace entirely is worse: a review that
 * took ninety seconds with no visible reason looks stuck, and a user who cannot
 * see that the agent opened the playbook and read their file has no reason to
 * trust the answer.
 *
 * So the names are translated, not removed. Each entry says what the agent is
 * doing in the user's own vocabulary, and carries a glyph so a run reads as a
 * sequence at a glance rather than as a wall of Korean.
 *
 * Unknown tools fall through to the raw name. That is deliberate — inventing a
 * friendly label for a tool nobody mapped would be a lie about what ran, and
 * seeing the raw name is how anyone notices this table needs an entry.
 */

export type ToolKind = "playbook" | "document" | "search" | "compute" | "other";

export interface ToolLabel {
  /** What the agent is doing, in the user's terms. */
  label: string;
  kind: ToolKind;
}

/** Exact matches first — these are the tools that actually show up. */
const EXACT: Record<string, ToolLabel> = {
  skill_view: { label: "플레이북 확인", kind: "playbook" },
  skill_search: { label: "플레이북 검색", kind: "playbook" },
  skills: { label: "플레이북 확인", kind: "playbook" },

  read_file: { label: "문서 읽는 중", kind: "document" },
  write_file: { label: "문서 작성", kind: "document" },
  edit_file: { label: "문서 수정", kind: "document" },
  file: { label: "문서 처리", kind: "document" },

  web_search: { label: "웹 검색", kind: "search" },
  web_fetch: { label: "웹 페이지 확인", kind: "search" },
  web: { label: "웹 검색", kind: "search" },
  session_search: { label: "이전 대화 검색", kind: "search" },
  memory: { label: "기억 조회", kind: "search" },
  context_engine: { label: "맥락 정리", kind: "search" },

  // mi-report's pipeline stages arrive as tool names too.
  digest_generate: { label: "뉴스 다이제스트 생성", kind: "compute" },
  priority_risk: { label: "우선순위·리스크 분석", kind: "compute" },
  critical_point: { label: "관리 포인트 분석", kind: "compute" },
  rag: { label: "코퍼스 검색", kind: "search" },

  // marketing-agent's synthetic progress frames.
  source_register: { label: "자료 등록", kind: "document" },
  pipeline_run: { label: "10개 에이전트 분석", kind: "compute" },

  terminal: { label: "자료 처리", kind: "compute" },
  code_execution: { label: "계산 실행", kind: "compute" },
  todo: { label: "작업 정리", kind: "other" },
  clarify: { label: "확인 요청", kind: "other" },
  delegation: { label: "하위 작업 위임", kind: "compute" },
};

/** Prefix rules for families whose members are generated, e.g. per topic. */
const PREFIXES: [string, ToolLabel][] = [
  ["docparser_", { label: "문서 분석", kind: "document" }],
  ["topic_generate", { label: "주제 요약", kind: "compute" }],
  ["topic_audit", { label: "근거 검증", kind: "compute" }],
  ["memory_", { label: "기억 조회", kind: "search" }],
  ["skill_", { label: "플레이북 확인", kind: "playbook" }],
];

export function labelForTool(tool: string): ToolLabel {
  const exact = EXACT[tool];
  if (exact) return exact;

  for (const [prefix, label] of PREFIXES) {
    if (tool.startsWith(prefix)) {
      // Keep the qualifier when there is one: "주제 요약 — 컨센서스" says more
      // than "주제 요약" repeated four times in a row.
      const rest = tool.slice(prefix.length).replace(/^[:_-]/, "").trim();
      return rest ? { ...label, label: `${label.label} — ${rest}` } : label;
    }
  }

  // Unmapped: show the real name rather than guess at one.
  return { label: tool, kind: "other" };
}

/** Human elapsed time. Sub-second durations are noise; round them away. */
export function formatDuration(seconds: number): string {
  if (seconds < 1) return "";
  if (seconds < 60) return `${Math.round(seconds)}초`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}
