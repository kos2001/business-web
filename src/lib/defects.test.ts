import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The path has to be set before the module is imported, because it reads the
// env once at load. A static import would bind the production database and
// `_resetForTests` would empty it on every `beforeEach` — which is exactly what
// happened until this was fixed. `actions.test.ts` had solved it already; this
// file did not follow it.
const DB = join(tmpdir(), `defects-test-${process.pid}.db`);
process.env.DEFECTS_DB_PATH = DB;

const {
  _resetForTests,
  normaliseQuote,
  recordDefect,
  recurringPatterns,
  spellingChange,
  summariseDefects,
} = await import("./defects");

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
});

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

describe("_resetForTests 안전장치", () => {
  it("운영 경로에서는 거부한다", async () => {
    // The guard exists because this function silently emptied the production
    // store for a while. Testing it in a separate module instance is the only
    // way to exercise the refusal without pointing this suite at that store.
    const prev = process.env.DEFECTS_DB_PATH;
    process.env.DEFECTS_DB_PATH = "/Users/someone/.hermes/business-web-data/defects.db";
    const mod = await import(`./defects?guard=${Date.now()}`);
    expect(() => mod._resetForTests()).toThrow(/test database/);
    process.env.DEFECTS_DB_PATH = prev;
  });
});

describe("시드가 드러낸 묶기 결함", () => {
  it("교정이 인용보다 짧아도 같은 습관으로 묶는다", () => {
    // 배상율 인하 / 지연배상율 / 연체 배상율 — one 율/률 habit reported three
    // ways. Diffing quote against correction whole gave 율인하→률 for the first
    // and split the pattern below the threshold.
    const a = spellingChange("배상율 인하", "'배상률'의 오타입니다.");
    const b = spellingChange("지연배상율", "'지연배상률'의 오타입니다.");
    const c = spellingChange("연체 배상율", "'연체 배상률'의 오타입니다.");
    expect(a).toBe("율→률");
    expect([b, c]).toEqual(["율→률", "율→률"]);
  });

  it("수치 결함은 인용이 아니라 교정 내용으로 묶는다", () => {
    // The quote is wherever the mistake landed; the correction is what is
    // stable. Keying on the quote meant a recurring wrong citation could never
    // be seen as recurring.
    const r = "감액 근거는 제398조 제2항입니다.";
    const keys = ["민법 제393조", "민법 제393조 감액", "제393조에 따라 감액"]
      .map((q) => normaliseQuote("number", q, r));
    expect(new Set(keys).size).toBe(1);
  });

  it("교정을 못 찾은 수치 결함은 여전히 인용으로 묶는다", () => {
    expect(normaliseQuote("number", "40일 초과", "")).toBe("number:40일 초과");
  });

  it("전혀 다른 단어는 오타로 묶지 않는다", () => {
    expect(spellingChange("계약서 전체", "'해지'의 오타입니다.")).toBeNull();
  });
});
