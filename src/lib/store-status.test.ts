import { describe, expect, it } from "vitest";
import { storeFindings, type CorpusStatus, type StagingStatus } from "./store-status";

/**
 * The filesystem readers are thin wrappers over `readdir`/`stat`; what is worth
 * testing is which facts become findings, since that is the judgement the page
 * is built on.
 */
function corpus(over: Partial<CorpusStatus> = {}): CorpusStatus {
  return {
    available: true,
    indexed: true,
    indexedAt: "2026-09-01T00:00:00.000Z",
    documents: [{ name: "표준공급계약서_2026.docx", bytes: 1000, at: "2026-08-30T00:00:00.000Z" }],
    bytes: 1000,
    unindexed: [],
    root: "/corpus",
    ...over,
  };
}

function staging(over: Partial<StagingStatus> = {}): StagingStatus {
  return { files: [], bytes: 0, expiringSoon: 0, root: "/staging", ...over };
}

describe("storeFindings", () => {
  it("says nothing when the stores are fine", () => {
    // No "모두 정상" entry on purpose: a list that always has something in it
    // stops being read.
    expect(storeFindings(corpus(), staging())).toEqual([]);
  });

  it("leads with a missing docparser, which disables both filing and search", () => {
    const [f] = storeFindings(corpus({ available: false }), staging());
    expect(f.severity).toBe("urgent");
    expect(f.title).toContain("docparser");
  });

  it("treats an unindexed document as urgent, because the failure is silent", () => {
    const [f] = storeFindings(corpus({ unindexed: ["A사_공급계약.docx"] }), staging());
    expect(f.severity).toBe("urgent");
    expect(f.title).toContain("1건");
  });

  it("counts every unindexed document, not just the first", () => {
    const [f] = storeFindings(corpus({ unindexed: ["a.docx", "b.docx", "c.docx"] }), staging());
    expect(f.title).toContain("3건");
  });

  it("reports an empty corpus as attention, not as a fault", () => {
    // Nothing is broken; nothing has been filed yet. Calling that urgent on a
    // fresh install would make the first finding someone sees a false alarm.
    const [f] = storeFindings(corpus({ documents: [], unindexed: [] }), staging());
    expect(f.severity).toBe("attention");
    expect(f.title).toContain("선례");
  });

  it("does not also complain about indexing when the corpus is empty", () => {
    const found = storeFindings(corpus({ documents: [], unindexed: [] }), staging());
    expect(found).toHaveLength(1);
  });

  it("does not complain about the corpus at all when docparser is missing", () => {
    // One cause, one finding. Listing "선례 없음" underneath "docparser 없음"
    // is two lines for one thing to fix.
    const found = storeFindings(
      corpus({ available: false, documents: [], unindexed: ["a.docx"] }),
      staging(),
    );
    expect(found).toHaveLength(1);
  });

  it("names staging files that are about to be swept", () => {
    const found = storeFindings(corpus(), staging({ expiringSoon: 2 }));
    expect(found[0].title).toContain("2건");
    expect(found[0].severity).toBe("attention");
  });

  it("reports corpus and staging problems together", () => {
    const found = storeFindings(
      corpus({ unindexed: ["a.docx"] }),
      staging({ expiringSoon: 1 }),
    );
    expect(found).toHaveLength(2);
    expect(found[0].severity).toBe("urgent");
  });
});
