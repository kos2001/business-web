import { describe, expect, it } from "vitest";
import { checkAgainstSource } from "./source-check";

/**
 * Trimmed from the parsed 공급계약서_한빛_불리.docx, including the 품목표 exactly
 * as docparser extracts it. The figures in that table are what a negotiation
 * turns on, so they are what the tests are built around.
 */
const SOURCE = `
제4조 (검수)
갑은 납품일로부터 기간 제한 없이 검수를 진행할 수 있으며, 갑의 합격 통보 전까지 대금 지급 의무가 발생하지 아니한다.

제5조 (지연배상)
을이 납기를 지연한 경우 지연 1일당 계약금액의 2.5%를 배상한다. 배상액 상한은 두지 아니한다.

| 품목 | 단가 | 월 최소물량 | 납기 |
| SEM-A100 | 14,200원 | 8,000개 | 발주 후 21일 |
| SEM-B220 | 9,800원 | 5,000개 | 발주 후 28일 |
| SEM-C310 | 23,500원 | 1,200개 | 발주 후 35일 |
`;

describe("checkAgainstSource", () => {
  it("passes a review that quotes the contract accurately", () => {
    const answer = `제5조 (지연배상) — 심각도: 높음
원문: "을이 납기를 지연한 경우 지연 1일당 계약금액의 2.5%를 배상한다."
왜 불리한가: 상한이 없습니다.`;
    const r = checkAgainstSource(answer, SOURCE);
    expect(r.ok).toBe(true);
    expect(r.quotesChecked).toBe(1);
    expect(r.issues).toEqual([]);
  });

  it("tolerates the whitespace and quote glyphs a converter changes", () => {
    const answer = `원문: “을이 납기를 지연한 경우   지연 1일당 계약금액의 2.5% 를 배상한다.”`;
    expect(checkAgainstSource(answer, SOURCE).ok).toBe(true);
  });

  it("catches a quotation that is not in the document", () => {
    const answer = `원문: "을은 갑에게 매월 실적 보고서를 제출하여야 한다."`;
    const r = checkAgainstSource(answer, SOURCE);
    expect(r.ok).toBe(false);
    expect(r.issues[0].kind).toBe("misquote");
  });

  it("catches a figure altered inside an otherwise real quotation", () => {
    // The failure that matters most: the sentence is right, the number is not.
    const answer = `원문: "을이 납기를 지연한 경우 지연 1일당 계약금액의 0.25%를 배상한다."`;
    expect(checkAgainstSource(answer, SOURCE).ok).toBe(false);
  });

  it("accepts the table figures as sourced", () => {
    const answer = `SEM-A100 단가 14,200원, 월 최소물량 8,000개, 납기 21일 기준으로 검토했습니다.`;
    const r = checkAgainstSource(answer, SOURCE);
    expect(r.issues).toEqual([]);
  });

  it("flags a table figure the answer got wrong", () => {
    const answer = `SEM-A100 단가는 14,000원입니다.`;
    const r = checkAgainstSource(answer, SOURCE);
    expect(r.issues).toEqual([
      { kind: "unsourced-number", label: "문서에 없는 수치", evidence: "14,000원" },
    ]);
  });

  it("reports a proposed figure without calling the answer wrong", () => {
    // "상한을 10%로" is the agent's own proposal, not a claim about the text.
    const answer = `제안: 배상액 상한을 계약금액의 10%로 한정합니다.`;
    const r = checkAgainstSource(answer, SOURCE);
    expect(r.ok).toBe(true);
    expect(r.issues[0].kind).toBe("unsourced-number");
  });

  it("does not treat clause references as figures", () => {
    const answer = `제4조와 제5조, 제11조를 함께 봐야 합니다.`;
    expect(checkAgainstSource(answer, SOURCE).issues).toEqual([]);
  });

  it("does not report the same figure twice", () => {
    const answer = `상한을 10%로 두고, 다시 말해 10%를 넘지 않게 합니다.`;
    expect(checkAgainstSource(answer, SOURCE).issues).toHaveLength(1);
  });

  it("says how many quotations it checked, so zero problems can be read", () => {
    const answer = `계약서를 검토했습니다. 문제는 없어 보입니다.`;
    const r = checkAgainstSource(answer, SOURCE);
    expect(r.quotesChecked).toBe(0);
    expect(r.ok).toBe(true);
  });

  it("passes everything when there is no source to check against", () => {
    expect(checkAgainstSource(`원문: "아무 말"`, "  ").ok).toBe(true);
  });
});
