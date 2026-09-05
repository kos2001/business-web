import { describe, expect, it } from "vitest";
import { noteFileName, renderNote } from "./obsidian";

/**
 * `saveNote` touches a real vault, so what is tested here is the part that
 * turns untrusted text into a filename and a note body — the part where a
 * mistake writes outside the folder or produces something Obsidian cannot link.
 */
describe("noteFileName", () => {
  it("keeps an ordinary Korean title", () => {
    expect(noteFileName("A사 공급계약 검토")).toBe("A사 공급계약 검토.md");
  });

  it("strips path separators so a title cannot escape the folder", () => {
    expect(noteFileName("../../etc/passwd")).toBe("etc passwd.md");
  });

  it("strips a leading dot so a title cannot make a hidden file", () => {
    expect(noteFileName(".hidden")).toBe("hidden.md");
  });

  it("strips the characters Obsidian uses for its own link syntax", () => {
    // # ^ [ ] | are heading, block-ref and alias markers; a note named with
    // them cannot be linked to.
    expect(noteFileName("제5조 [지연배상] #위험 | 검토")).toBe("제5조 지연배상 위험 검토.md");
  });

  it("collapses runs of whitespace rather than leaving them in the name", () => {
    expect(noteFileName("A사    공급   계약")).toBe("A사 공급 계약.md");
  });

  it("caps the length so a long first sentence cannot become the filename", () => {
    expect(noteFileName("가".repeat(300)).length).toBeLessThanOrEqual(83);
  });

  it("falls back rather than producing a bare extension", () => {
    expect(noteFileName("///")).toBe("무제.md");
    expect(noteFileName("   ")).toBe("무제.md");
  });
});

describe("renderNote", () => {
  const note = renderNote({
    title: "A사 공급계약 검토",
    workspace: "contract",
    body: "제5조는 상한이 없어 무한 책임입니다.",
    sources: [
      "/staging/abc12345-A사_공급계약_2025.docx.md",
      "/staging/abc12345-A사_공급계약_2025.docx.md",
    ],
  });

  it("writes frontmatter Obsidian can index", () => {
    expect(note.startsWith("---\n")).toBe(true);
    expect(note).toContain("workspace: contract");
    expect(note).toContain("tags: [영업에이전트]");
  });

  it("keeps the answer verbatim", () => {
    expect(note).toContain("제5조는 상한이 없어 무한 책임입니다.");
  });

  it("links sources as wikilinks so the note joins the graph", () => {
    expect(note).toContain("- [[A사_공급계약_2025.docx]]");
  });

  it("strips the staging uuid, which is noise in a note", () => {
    expect(note).not.toContain("abc12345-");
  });

  it("does not list the same source twice", () => {
    expect(note.match(/A사_공급계약_2025/g)?.length).toBe(2); // frontmatter + link
  });

  it("omits the 근거 문서 section when there are no sources", () => {
    const bare = renderNote({ title: "메모", workspace: "market", body: "본문" });
    expect(bare).not.toContain("근거 문서");
  });

  it("quotes the title so a colon cannot break the YAML", () => {
    const n = renderNote({ title: "제5조: 지연배상", workspace: "contract", body: "x" });
    expect(n).toContain('title: "제5조: 지연배상"');
  });
});
