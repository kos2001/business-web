import { describe, expect, it } from "vitest";
import { expectedRateSuffix, inspectAnswer, summariseIssues } from "./answer-quality";

/**
 * The corrupted passages here are verbatim from live runs of 계약서 분석 against
 * 공급계약서_한빛_불리.docx. They are the reason the module exists, so they are
 * the tests: a change that stops catching them has undone the work.
 */
const LOOP_RUN = `검토 결과 — 한 줄 요약 지금 서명하면 안 됩니다. 이 초안은 책임 상한 없음(무한 책임), 배경 권리 양도, 일방 해지로 구성돼 것이 아니라 구조젹으로 을 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀 귀귀 귀귀.`;

const SYLLABLE_RUN = `시간이 갈수록 하자가 원인으로 간 책임인지 특정할 수 없이 밟집니데 에넀 즉즉즉 에즉
으 함게 위가 이즉즉칙 앉완은즉좀 완료 지달합니다.`;

const CLEAN = `제5조 (지연배상) — 심각도: 높음
원문: "을이 납기를 지연한 경우 지연 1일당 계약금액의 2.5%를 배상한다."
왜 불리한가: 상한이 없어 계약금액을 초과하는 배상이 가능합니다.
제안: 배상액 상한을 계약금액의 10%로 한정하는 문구를 추가합니다.

## 다음 액션
- 제5조 배상 상한 문구 내부 협의
- 법무에 무한책임 조항 유효성 검토 의뢰`;

describe("inspectAnswer", () => {
  it("passes a clean contract review", () => {
    expect(inspectAnswer(CLEAN)).toEqual({ ok: true, issues: [] });
  });

  it("passes empty text rather than reporting on nothing", () => {
    expect(inspectAnswer("   ").ok).toBe(true);
  });

  it("catches the spaced token loop", () => {
    const r = inspectAnswer(LOOP_RUN);
    expect(r.ok).toBe(false);
    expect(r.issues[0].kind).toBe("repetition");
    expect(r.issues[0].evidence).toContain("귀 귀");
  });

  it("catches the run-together syllable loop", () => {
    const r = inspectAnswer(SYLLABLE_RUN);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === "repetition")).toBe(true);
  });

  it("catches hanja, counting them", () => {
    const r = inspectAnswer("지연배상 조항이 있忌 준거법(準拠法)이 없습니다.");
    const issue = r.issues.find((i) => i.kind === "foreign-script");
    expect(issue?.label).toBe("한자 4자");
  });

  it("catches cyrillic that leaked mid-word", () => {
    const r = inspectAnswer("책임이 об향적이지 않습니다.");
    expect(r.issues.some((i) => i.label.startsWith("키릴"))).toBe(true);
  });

  it("does not flag English or numbers", () => {
    expect(inspectAnswer("NDA 초안, MOQ 8,000개, ISO 9001 인증 확인").ok).toBe(true);
  });

  it("does not flag a doubled short word, which real prose does", () => {
    // "갑 갑" appears in tables of party columns; three would still pass, four
    // is the line. Set deliberately so ordinary text is never held back.
    expect(inspectAnswer("구분 갑 갑 을 을 비고").ok).toBe(true);
  });

  it("reports every distinct problem, not just the first", () => {
    const r = inspectAnswer(`${LOOP_RUN}\n준거법(準拠法) 조항이 없습니다.`);
    expect(r.issues.map((i) => i.kind).sort()).toEqual(["foreign-script", "repetition"]);
  });

  it("keeps the evidence short enough to show in one line", () => {
    for (const issue of inspectAnswer(LOOP_RUN).issues) {
      expect(issue.evidence.length).toBeLessThanOrEqual(120);
    }
  });
});

describe("summariseIssues", () => {
  it("joins the labels for a one-line warning", () => {
    const r = inspectAnswer(`${LOOP_RUN}\n準拠法`);
    expect(summariseIssues(r.issues)).toBe("같은 글자가 반복되는 구간, 한자 3자");
  });
});

describe("률/율", () => {
  it("catches the defect that three workspaces recorded and SOUL.md failed to stop", () => {
    const r = inspectAnswer("일 배상율 2.5% 를 40일 적용하면 계약금액의 100% 입니다.");
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([
      expect.objectContaining({ kind: "orthography", label: "배상율 → 배상률" }),
    ]);
  });

  it("names the correction, because the rule decides it rather than guessing", () => {
    expect(summariseIssues(inspectAnswer("지연배상율과 불량율").issues)).toBe(
      "지연배상율 → 지연배상률, 불량율 → 불량률",
    );
  });

  it("leaves correct spellings alone, including the ones that look wrong", () => {
    // 규율·조율·요율·비율 all take 율 legitimately: the syllable before has no
    // final consonant. 확률·시청률·가동률 take 률. None of these is a defect.
    const clean =
      "규율과 조율, 요율 비율 할인율 증가율 실패율 백분율 환율 효율 자율 선율 " +
      "확률 시청률 가동률 불량률 배상률 지연배상률 달성률 법률 경쟁률 실업률";
    expect(inspectAnswer(clean)).toEqual({ ok: true, issues: [] });
  });

  it("reports a repeated misspelling once", () => {
    const r = inspectAnswer("배상율은 2.5% 입니다. 배상율 상한이 없습니다. 배상율 검토 요망.");
    expect(r.issues).toHaveLength(1);
  });

  it("ignores 률/율 with no Hangul syllable in front of it", () => {
    expect(inspectAnswer("율무차와 律 그리고 100율").ok).toBe(false); // 한자만 걸린다
    expect(inspectAnswer("율무차").issues).toEqual([]);
  });

  it("derives the suffix from the final consonant, not a word list", () => {
    expect(expectedRateSuffix("비")).toBe("율"); // 받침 없음
    expect(expectedRateSuffix("인")).toBe("율"); // ㄴ 받침
    expect(expectedRateSuffix("상")).toBe("률"); // ㅇ 받침
    expect(expectedRateSuffix("확")).toBe("률"); // ㄱ 받침
    expect(expectedRateSuffix("A")).toBeNull();
  });
});

describe("붙여 써야 하는 말", () => {
  it("catches 안 건, which the store recorded twice from one workspace", () => {
    const r = inspectAnswer("Q3 단가 조정 안 건 서면 제공");
    expect(r.issues).toEqual([
      expect.objectContaining({ kind: "orthography", label: "안 건 → 안건" }),
    ]);
  });

  it("leaves 안 alone when it is negating a verb", () => {
    // 안 건드린다 · 안 걷힌다 — the same two characters, not the same word.
    expect(inspectAnswer("아직 안 건드렸습니다. 회수가 안 걷힙니다.").ok).toBe(true);
  });

  it("does not flag words that merely repeat, which is not decidable", () => {
    // Measured: a general repeated-word check produced 58 false positives out
    // of 59 matches on this repository. These are all correct Korean.
    const fine =
      "지연한 경우 지연배상금을 지급한다. 3개월, 6개월, 12개월 단위로 본다. " +
      "어느 고객·어느 딜에서 들은 말인지 밝힌다.";
    expect(inspectAnswer(fine)).toEqual({ ok: true, issues: [] });
  });
});
