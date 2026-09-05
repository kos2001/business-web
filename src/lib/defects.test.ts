import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetForTests,
  normaliseQuote,
  recordDefect,
  recurringPatterns,
  spellingChange,
  summariseDefects,
} from "./defects";

function record(n: number, over: Partial<Parameters<typeof recordDefect>[0]> = {}) {
  for (let i = 0; i < n; i += 1) {
    recordDefect({
      workspace: "contract",
      kind: "spelling",
      quote: "배상율",
      reason: "'배상률'의 오타입니다.",
      ...over,
    });
  }
}

beforeEach(() => _resetForTests());

describe("normaliseQuote", () => {
  it("treats the same token as the same defect despite spacing and quotes", () => {
    expect(normaliseQuote("spelling", ' "배상율" ')).toBe(
      normaliseQuote("spelling", "배상율"),
    );
  });

  it("keeps different kinds apart even with identical text", () => {
    expect(normaliseQuote("spelling", "가")).not.toBe(normaliseQuote("number", "가"));
  });

  it("groups long quotes only when they match on their opening", () => {
    const a = "제5조 지연배상 조항의 문장이 중간에서 끊겨 앞뒤가 이어지지 않습니다";
    const b = "제5조 지연배상 조항의 문장이 중간에서 끊겨 다른 방식으로 끝납니다";
    // Divergence inside the window keeps them separate. Under-grouping is the
    // error to prefer: a missed pattern costs one unwritten rule, a false one
    // sends someone to write a rule for a problem that is not there.
    expect(normaliseQuote("broken-context", a)).not.toBe(
      normaliseQuote("broken-context", b),
    );
    expect(normaliseQuote("broken-context", a)).toBe(normaliseQuote("broken-context", a));
  });
});

describe("recurringPatterns", () => {
  it("stays quiet below the threshold — twice is bad luck", () => {
    record(2);
    expect(recurringPatterns()).toEqual([]);
  });

  it("reports a defect once it has happened three times", () => {
    record(3);
    const [p] = recurringPatterns();
    expect(p.count).toBe(3);
    expect(p.quote).toBe("배상율");
  });

  it("calls a defect confined to one workspace a playbook problem", () => {
    record(4);
    expect(recurringPatterns()[0].scope).toBe("playbook");
  });

  it("calls a defect spread across workspaces a profile problem", () => {
    // The twenty workspaces share one SOUL; a habit visible in several of them
    // is the model's, and a rule in one playbook would fix a fraction of it.
    for (const w of ["contract", "contract-plan", "pipeline"]) record(1, { workspace: w });
    const [p] = recurringPatterns();
    expect(p.scope).toBe("profile");
    expect(p.workspaces).toEqual(["contract", "contract-plan", "pipeline"]);
  });

  it("does not merge different defects into one pattern", () => {
    record(3);
    record(3, { quote: "반돋시", reason: "'반드시'의 오타입니다." });
    expect(recurringPatterns()).toHaveLength(2);
  });

  it("orders by how often it happens", () => {
    record(3, { quote: "가끔" });
    record(7, { quote: "자주" });
    expect(recurringPatterns().map((p) => p.quote)).toEqual(["자주", "가끔"]);
  });

  it("drops out of the window once it stops happening", () => {
    // A rule that works should clear the list; an unbounded history would keep
    // fixed problems on it forever. Asked from forty days in the future, a
    // thirty-day window no longer contains today's defects.
    record(3);
    expect(recurringPatterns(30)).toHaveLength(1);
    const later = Date.now() + 40 * 86_400_000;
    expect(recurringPatterns(30, 3, later)).toEqual([]);
  });

  it("counts every workspace it appeared in, without duplicates", () => {
    record(2, { workspace: "contract" });
    record(2, { workspace: "contract-plan" });
    expect(recurringPatterns()[0].workspaces).toEqual(["contract", "contract-plan"]);
  });
});

describe("summariseDefects", () => {
  it("counts everything recorded, not just what recurs", () => {
    record(2);
    record(3, { kind: "number", quote: "142,00" });
    const s = summariseDefects();
    expect(s.total).toBe(5);
    expect(s.recurring).toBe(1);
    expect(s.byKind).toEqual({ spelling: 2, number: 3 });
  });

  it("reports zero on an empty store rather than failing", () => {
    expect(summariseDefects()).toEqual({ total: 0, recurring: 0, byKind: {} });
  });
});

describe("spellingChange", () => {
  it("finds the change inside a longer phrase", () => {
    expect(spellingChange("지연배상율", "'지연배상률'의 오타입니다.")).toBe("율→률");
  });

  it("gives the same key for the same habit in different words", () => {
    // The failure that prompted this: one 율/률 habit was reported as
    // 지연배상율 twice and 연체 배상율 once — two groups, both under the
    // threshold, so the loop said nothing about the thing it exists to catch.
    expect(spellingChange("연체 배상율", "'연체 배상률'의 오타입니다.")).toBe(
      spellingChange("지연배상율", "'지연배상률'의 오타입니다."),
    );
  });

  it("handles a change at the start", () => {
    expect(spellingChange("반돋시", "'반드시'의 오타입니다.")).toBe("돋→드");
  });

  it("returns null when the words share nothing — a wrong word, not a typo", () => {
    expect(spellingChange("계약", "'해지'의 오타입니다.")).toBeNull();
  });

  it("returns null when the reason names no correction", () => {
    expect(spellingChange("배상율", "문맥상 어색합니다.")).toBeNull();
  });
});

describe("normaliseQuote with a reason", () => {
  it("groups one habit across different phrasings", () => {
    expect(normaliseQuote("spelling", "지연배상율", "'지연배상률'의 오타입니다.")).toBe(
      normaliseQuote("spelling", "연체 배상율", "'연체 배상률'의 오타입니다."),
    );
  });

  it("falls back to the quote when no change can be derived", () => {
    expect(normaliseQuote("spelling", "배상율", "설명 없음")).toBe("spelling:배상율");
  });
});
