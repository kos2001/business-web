import { describe, expect, it } from "vitest";
import { formatDuration, labelForTool } from "./tool-labels";

describe("labelForTool", () => {
  it("translates the tools a sales user actually sees", () => {
    expect(labelForTool("skill_view").label).toBe("플레이북 확인");
    expect(labelForTool("read_file").label).toBe("문서 읽는 중");
  });

  it("renames terminal — it reads as something going wrong", () => {
    expect(labelForTool("terminal").label).toBe("자료 처리");
  });

  it("keeps the qualifier on generated tool families", () => {
    // "주제 요약" four times in a row says less than naming each topic.
    expect(labelForTool("topic_generate:컨센서스").label).toBe("주제 요약 — 컨센서스");
    expect(labelForTool("topic_audit:경쟁사IR").label).toBe("근거 검증 — 경쟁사IR");
  });

  it("matches docparser tools by prefix", () => {
    expect(labelForTool("docparser_hybrid_search").kind).toBe("document");
  });

  it("falls through to the raw name for anything unmapped", () => {
    // Inventing a friendly label would misreport what ran, and seeing the raw
    // name is how anyone notices the table needs an entry.
    expect(labelForTool("some_new_tool").label).toBe("some_new_tool");
    expect(labelForTool("some_new_tool").kind).toBe("other");
  });

  it("groups tools by kind so the trace reads as a sequence", () => {
    expect(labelForTool("skill_view").kind).toBe("playbook");
    expect(labelForTool("read_file").kind).toBe("document");
    expect(labelForTool("web_search").kind).toBe("search");
    expect(labelForTool("terminal").kind).toBe("compute");
  });
});

describe("formatDuration", () => {
  it("drops sub-second timings as noise", () => {
    expect(formatDuration(0.4)).toBe("");
    expect(formatDuration(0)).toBe("");
  });

  it("reads in Korean units", () => {
    expect(formatDuration(3.2)).toBe("3초");
    expect(formatDuration(90)).toBe("1분 30초");
    expect(formatDuration(120)).toBe("2분");
  });
});
