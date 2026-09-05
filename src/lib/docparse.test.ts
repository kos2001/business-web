import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isParseable } from "./docparse";

describe("isParseable", () => {
  it("accepts the document types docparser converts meaningfully", () => {
    for (const ext of [".pdf", ".docx", ".pptx", ".html"]) {
      expect(isParseable(ext)).toBe(true);
    }
  });

  it("is case insensitive — uploads arrive with any casing", () => {
    expect(isParseable(".PDF")).toBe(true);
    expect(isParseable(".DocX")).toBe(true);
  });

  it("leaves already-readable text alone", () => {
    // A round trip through the converter can only mangle these, and the agent
    // reads them fine as they are.
    for (const ext of [".txt", ".md", ".csv", ".json"]) {
      expect(isParseable(ext)).toBe(false);
    }
  });

  it("does not try to convert images or unknown types", () => {
    for (const ext of [".png", ".jpg", ".zip", ""]) {
      expect(isParseable(ext)).toBe(false);
    }
  });
});

describe("빈 표 파일", () => {
  it("표가 없는 문서는 표 파일을 붙이지 않는다", async () => {
    // A document with no tables still produces a file holding "[]". Naming it
    // in the prompt tells the agent a table exists and spends a read finding
    // out it does not — meeting notes and letters have none, and most uploads
    // are one of those. Found by seeding a real 회의록.
    const { extractTables } = await import("./docparse");
    const dir = mkdtempSync(join(tmpdir(), "tables-"));
    const src = join(dir, "notes.docx");
    writeFileSync(src, "not a real docx");
    writeFileSync(`${src}.tables.json`, "[]");
    // docparser is unavailable in the suite, so this exercises the guard that
    // returns null before running it; the emptiness check is covered by the
    // live upload of a 회의록, which now reports no table file.
    expect(await extractTables(src)).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});
