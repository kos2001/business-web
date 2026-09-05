import { describe, expect, it } from "vitest";
import { extractCandidates } from "./action-extract";

/** A shape the discovery playbook actually produces. */
const DISCOVERY = `
## A사 — 디스커버리 노트

예산 : 미확인
경쟁 : C사

다음 액션
- [ ] 담당자 — 예산 범위와 결재 시점을 물어보기 (기한: 2026-09-10)
- [ ] 담당자 — 김부장이 실무 담당인지 확인
- [ ] 데모 자료 준비

확인 못한 것 (다음 미팅 필수 질문)
- 예산 범위와 구매 시기
`;

describe("extractCandidates", () => {
  it("reads the follow-up section a playbook emits", () => {
    const c = extractCandidates(DISCOVERY);
    expect(c.length).toBeGreaterThanOrEqual(3);
    expect(c[0].title).toContain("예산 범위와 결재 시점");
  });

  it("picks up a due date written inline", () => {
    expect(extractCandidates(DISCOVERY)[0].due).toBe("2026-09-10");
  });

  it("keeps the metadata out of the title", () => {
    // Otherwise every row reads "…물어보기 (기한: 2026-09-10)".
    expect(extractCandidates(DISCOVERY)[0].title).not.toContain("2026-09-10");
  });

  it("ignores bullets outside a follow-up section", () => {
    // A contract review has thirty bullets; proposing all of them is the same
    // as proposing nothing, because nobody scans thirty checkboxes.
    const body = "## 위험 조항\n- 제5조 지연배상이 무상한이다\n- 제9조 즉시 해지\n";
    expect(extractCandidates(body)).toHaveLength(0);
  });

  it("stops at the next heading", () => {
    const c = extractCandidates(DISCOVERY);
    expect(c.some((x) => x.title.includes("구매 시기"))).toBe(false);
  });

  it("captures an owner when the line names one", () => {
    const t = "사내 확인 사항\n- 법무 검토 요청 — 담당: 김대리\n";
    expect(extractCandidates(t)[0].owner).toBe("김대리");
  });

  it("leaves owner null when the line names none", () => {
    const t = "다음 액션\n- 경쟁사 단가 자료를 확보한다\n";
    expect(extractCandidates(t)[0].owner).toBeNull();
  });

  it("recognises numbered lists and English headings", () => {
    const t = "Action Items\n1. 제안서 초안을 이번 주까지 작성한다\n2. 견적서를 발송한다\n";
    expect(extractCandidates(t)).toHaveLength(2);
  });

  it("de-duplicates repeated lines", () => {
    const t = "다음 액션\n- 예산 범위를 확인한다\n- 예산 범위를 확인한다\n";
    expect(extractCandidates(t)).toHaveLength(1);
  });

  it("drops fragments too short to be an action", () => {
    const t = "다음 액션\n- 확인\n- 예산 범위를 확인하고 결재선을 파악한다\n";
    const c = extractCandidates(t);
    expect(c).toHaveLength(1);
  });

  it("honours the limit so a long answer cannot flood the list", () => {
    const many = "다음 액션\n" +
      Array.from({ length: 30 }, (_, i) => `- 항목 번호 ${i} 를 처리한다`).join("\n");
    expect(extractCandidates(many, 5)).toHaveLength(5);
  });

  it("returns nothing for an answer with no follow-up section", () => {
    expect(extractCandidates("그냥 설명하는 문단입니다. 액션은 없습니다.")).toHaveLength(0);
  });
});

/** Real output shapes, copied from docs/examples.md. */
describe("real agent output", () => {
  it("reads the pipeline playbook's numbered next actions", () => {
    const real = `
다음 액션
1. 당신이, 오늘 중, A사의 마지막 고객 회신일 확인 → 정리 후보 접수 여부 결정
2. 당신이, 이번 주, B사에 견적 후속 확인 일자 설정
3. 당신이, 이번 주, C사 새 담당자 미팅에서 디스커버리 재확인
4. 당신이, D+2일 이내, D사 계약 검토 지연 사유 확답 받기
`;
    expect(extractCandidates(real)).toHaveLength(4);
  });

  it("proposes nothing when the agent declined to invent actions", () => {
    // discovery does this when the memo contains no agreed follow-up. Turning
    // that refusal into a task would undo the discipline it was exercising.
    const declined = `
다음 액션
- 담당자가 정할 항목이라 지금은 빈 상태입니다. 메모에 합의된 액션이 없어서 지어내지 않았습니다.
`;
    const c = extractCandidates(declined);
    expect(c.every((x) => !x.title.includes("지어내지"))).toBe(true);
  });

  it("keeps politely-phrased tasks, which end the same way explanations do", () => {
    // The agents write in 존댓말, so a real task and a description of the
    // situation both end in 니다. Dropping every 니다 line would empty the
    // panel exactly when the tone rule is being followed.
    const polite = `
다음 액션
- 참석자 명단과 미팅 목적을 확정해야 합니다.
- A사 예산 범위 확인이 필요합니다.
- 계약 초안을 법무에 검토 부탁드립니다.
- 제안서 초안을 다음 주 화요일까지 발송해 주세요.
`;
    expect(extractCandidates(polite).map((c) => c.title)).toEqual([
      "참석자 명단과 미팅 목적을 확정해야 합니다.",
      "A사 예산 범위 확인이 필요합니다.",
      "계약 초안을 법무에 검토 부탁드립니다.",
      "제안서 초안을 다음 주 화요일까지 발송해 주세요.",
    ]);
  });

  it("finds the section when the model renames it", () => {
    // Verbatim from account-brief: the playbook says "다음 액션", the model
    // wrote this instead, and the panel disappeared.
    const renamed = `
사전 준비(회사명 확인 전후 동일한 골격):
- 회사명·업종 확정 후 공개 정보 조사
- 미팅 의제와 시간 확정, 물어볼 질문 3~5개 정리

지금 단계에서 실행 가능한 액션:
- 회사명(법인명) 확인 — 사실 조사 착수
- 미팅 일시·참석자 명단 확정
`;
    const titles = extractCandidates(renamed).map((c) => c.title);
    expect(titles).toEqual([
      "회사명(법인명) 확인 — 사실 조사 착수",
      "미팅 일시·참석자 명단 확정",
    ]);
  });

  it("still drops a polite refusal that is not a request", () => {
    const refusal = `
다음 액션
- 메모에 합의된 항목이 없어 별도 액션을 제시하지 않았습니다.
`;
    expect(extractCandidates(refusal)).toHaveLength(0);
  });
});

describe("paragraph-form answers", () => {
  /** What pipeline actually returned — no list markers at all. */
  const PARAGRAPHS = `A사 무응답 건 — 다음 액션 세 개:

마지막 고객 회신일과 우리가 마지막으로 보낸 연락 시점을 둘 다 확인. 무응답이 "고객 침묵"인지 먼저 구분해야 한다.

판정 결과에 따라 실무자에게 후속 확인 연락 1회를 보내되 응답 기한을 명시한다 (예: 1주일 내 회신).

기한 내 응답이 없으면 이 건을 파이프라인 하향/정리 후보로 상신하고, 응답이 있으면 그때 단계를 재평가한다.`;

  it("reads a lead-in sentence, not just a bare heading", () => {
    // Requiring "다음 액션" on its own line missed most real answers — the
    // panel simply never appeared.
    expect(extractCandidates(PARAGRAPHS)).toHaveLength(3);
  });

  it("is not fooled by a trailing parenthetical hiding the verb", () => {
    const c = extractCandidates(PARAGRAPHS);
    expect(c[1].title).toContain("응답 기한을 명시한다");
  });

  it("still refuses a paragraph that is not an instruction", () => {
    const t = "다음 액션:\n\n이 건은 지금 판단하기 어려운 상황이다.\n\n담당자에게 예산을 확인.";
    const c = extractCandidates(t);
    expect(c).toHaveLength(1);
    expect(c[0].title).toContain("예산을 확인");
  });
});

describe("영문 답변", () => {
  it("finds a list under an English heading", () => {
    // The playbooks' 다음 액션 rule does not survive translation; an English
    // review heads its list "Next actions" and the panel found nothing at all.
    const answer = `## Summary\nThe draft is uncapped.\n\n## Next actions\n- Draft revised wording for the Article 5 cap\n- Request legal review of the uncapped indemnity\n- Confirm approval authority on Buyer side\n`;
    expect(extractCandidates(answer).map((c) => c.title)).toEqual([
      "Draft revised wording for the Article 5 cap",
      "Request legal review of the uncapped indemnity",
      "Confirm approval authority on Buyer side",
    ]);
  });

  it("also accepts Next steps", () => {
    const answer = `## Next steps\n- Confirm the signing date\n`;
    expect(extractCandidates(answer)).toHaveLength(1);
  });
});
