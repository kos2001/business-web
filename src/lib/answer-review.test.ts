import { describe, expect, it } from "vitest";
import { coerceFindings, extractJsonArray } from "./answer-review";

/**
 * `reviewAnswer` itself talks to a live gateway, so what is tested here is the
 * part that decides whether a reply is usable. That parsing is where the two
 * sibling projects both lost a day: mi-report assumed the first brace started
 * the payload, marketing-agent assumed the reply was bare JSON. Both shipped a
 * check that quietly returned nothing.
 */
describe("extractJsonArray", () => {
  it("reads a bare array", () => {
    expect(extractJsonArray('[{"kind":"spelling"}]')).toEqual([{ kind: "spelling" }]);
  });

  it("reads an array wrapped in a code fence", () => {
    expect(extractJsonArray('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it("reads an array after a sentence, which is the common failure", () => {
    const reply = '검수 결과입니다. 문제는 두 건입니다:\n[{"a":1},{"b":2}]';
    expect(extractJsonArray(reply)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("is not fooled by a bracket inside a string", () => {
    const reply = '[{"quote":"제5조 [지연배상] 항목","reason":"오타"}]';
    expect(extractJsonArray(reply)).toEqual([
      { quote: "제5조 [지연배상] 항목", reason: "오타" },
    ]);
  });

  it("is not fooled by an escaped quote inside a string", () => {
    const reply = '[{"quote":"\\"무한 책임\\" 표현","reason":"인용부호 오류"}]';
    expect(extractJsonArray(reply)).toEqual([
      { quote: '"무한 책임" 표현', reason: "인용부호 오류" },
    ]);
  });

  it("reads an empty array — the reviewer's way of saying nothing is wrong", () => {
    expect(extractJsonArray("검수 결과 문제 없습니다.\n[]")).toEqual([]);
  });

  it("returns null when there is no array at all", () => {
    // Distinct from []: nothing was judged, so nothing may be claimed.
    expect(extractJsonArray("문제 없습니다.")).toBeNull();
  });

  it("returns null on a truncated array rather than guessing", () => {
    expect(extractJsonArray('[{"kind":"spelling",')).toBeNull();
  });

  it("returns null when the array is not valid JSON", () => {
    expect(extractJsonArray("[this is not json]")).toBeNull();
  });

  it("returns null when the payload is an object, not an array", () => {
    expect(extractJsonArray('{"findings": 1}')).toBeNull();
  });
});

describe("coerceFindings", () => {
  it("keeps a well-formed finding", () => {
    expect(
      coerceFindings([
        { kind: "spelling", quote: "구조젹으로", reason: "'구조적으로'의 오타입니다." },
      ]),
    ).toEqual([
      { kind: "spelling", quote: "구조젹으로", reason: "'구조적으로'의 오타입니다." },
    ]);
  });

  it("drops an unknown kind rather than rendering it", () => {
    expect(coerceFindings([{ kind: "vibes", quote: "a", reason: "b" }])).toEqual([]);
  });

  it("drops entries missing a quote or a reason", () => {
    expect(
      coerceFindings([
        { kind: "spelling", quote: "", reason: "b" },
        { kind: "spelling", quote: "a", reason: "  " },
      ]),
    ).toEqual([]);
  });

  it("survives nulls and non-objects in the array", () => {
    expect(coerceFindings([null, 3, "x", []])).toEqual([]);
  });

  it("caps a runaway quote and reason so one finding cannot fill the panel", () => {
    const [f] = coerceFindings([
      { kind: "number", quote: "가".repeat(500), reason: "나".repeat(500) },
    ]);
    expect(f.quote).toHaveLength(80);
    expect(f.reason).toHaveLength(200);
  });

  it("keeps the good entries when one is malformed", () => {
    const out = coerceFindings([
      { kind: "spelling", quote: "반돋시", reason: "'반드시'의 오타" },
      { kind: "nope" },
      { kind: "table-misread", quote: "월 최소물량 상한", reason: "하한을 상한으로 읽음" },
    ]);
    expect(out.map((f) => f.kind)).toEqual(["spelling", "table-misread"]);
  });
});
