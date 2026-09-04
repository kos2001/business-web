import { describe, expect, it } from "vitest";
import { parseHits } from "./corpus";

/** One real docparser search result, trimmed to the fields the parser reads. */
const OUTPUT = JSON.stringify([
  {
    kind: "chunk",
    score: 0.032787,
    payload: {
      text: "제5조 (지연배상) 지연 1일당 계약금액의 0.2%를 배상하며 총액 상한은 15%로 한다.",
      source: "/tmp/corpus/documents/A사_공급계약_2026.docx",
      section: "A사\\_공급계약\\_2026",
      kind: "paragraph",
    },
  },
  {
    kind: "chunk",
    score: 0.032258,
    payload: {
      text: "제5조 (지연배상) 지연 1일당 계약금액의 0.1%를 배상하며 총액은 계약금액의 10%를 초과하지 아니한다.",
      source: "/tmp/corpus/documents/표준계약서_2025.docx",
      section: "표준계약서\\_2025",
      kind: "paragraph",
    },
  },
  {
    kind: "chunk",
    score: 0.031498,
    payload: {
      text: "A사\\_공급계약\\_2026",
      source: "/tmp/corpus/documents/A사_공급계약_2026.docx",
      section: "A사\\_공급계약\\_2026",
      kind: "heading",
    },
  },
]);

describe("parseHits", () => {
  it("keeps the passage and the contract it came from", () => {
    const hits = parseHits(OUTPUT);
    expect(hits[0].text).toContain("0.2%");
    expect(hits[0].document).toBe("A사_공급계약_2026.docx");
  });

  it("returns the same clause from different contracts side by side", () => {
    // This is the whole point of the corpus: what did we agree last time.
    const hits = parseHits(OUTPUT);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.document)).toEqual([
      "A사_공급계약_2026.docx",
      "표준계약서_2025.docx",
    ]);
  });

  it("drops headings — a filename is not a precedent", () => {
    const hits = parseHits(OUTPUT);
    expect(hits.some((h) => h.text.includes("A사\\_공급계약"))).toBe(false);
  });

  it("keeps a short clause that a length filter would have dropped", () => {
    const short = JSON.stringify([
      { payload: { text: "제9조 즉시 해지.", source: "/c/x.docx", kind: "paragraph" } },
    ]);
    expect(parseHits(short)).toHaveLength(1);
  });

  it("unescapes the underscores docling adds for Markdown", () => {
    expect(parseHits(OUTPUT)[0].section).toBe("A사_공급계약_2026");
  });

  it("de-duplicates identical passages", () => {
    const dup = JSON.stringify([
      { payload: { text: "제5조 동일 문구입니다.", source: "/c/a.docx", kind: "paragraph" } },
      { payload: { text: "제5조 동일 문구입니다.", source: "/c/b.docx", kind: "paragraph" } },
    ]);
    expect(parseHits(dup)).toHaveLength(1);
  });

  it("survives output that is not the JSON it expected", () => {
    // A CLI that errors or prints a banner must not take the request down.
    for (const bad of ["", "Ready. Run docparser ask", "[", "{}"]) {
      expect(parseHits(bad)).toEqual([]);
    }
  });

  it("ignores log lines printed before the JSON", () => {
    expect(parseHits(`Building index...\n${OUTPUT}`)).toHaveLength(2);
  });
});
