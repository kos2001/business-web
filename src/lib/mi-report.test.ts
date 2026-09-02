import { describe, expect, it } from "vitest";
import { formatSources, formatUngrounded, translateEvent } from "./mi-report";

const RUN = "mi_test";

describe("translateEvent", () => {
  it("maps a running progress frame to tool.started with its label", () => {
    const out = translateEvent(
      { type: "progress", tool: "rag", label: "코퍼스 검색: HBM4", status: "running" },
      RUN,
    );
    expect(out).toMatchObject({
      event: "tool.started",
      run_id: RUN,
      tool: "rag",
      preview: "코퍼스 검색: HBM4",
    });
  });

  it("maps the completion frame to tool.completed, not a second start", () => {
    const out = translateEvent(
      { type: "progress", tool: "rag", status: "completed" },
      RUN,
    );
    expect(out).toMatchObject({ event: "tool.completed", tool: "rag" });
  });

  it("drops a progress frame that names no tool", () => {
    expect(translateEvent({ type: "progress", status: "running" }, RUN)).toBeNull();
  });

  it("omits the preview when the label just repeats the tool name", () => {
    const out = translateEvent(
      { type: "progress", tool: "rag", label: "rag", status: "running" },
      RUN,
    );
    expect(out?.preview).toBeUndefined();
  });

  it("maps a delta to message.delta", () => {
    expect(translateEvent({ type: "delta", text: "안녕" }, RUN)).toMatchObject({
      event: "message.delta",
      delta: "안녕",
    });
  });

  it("accepts either 'text' or 'delta' as the delta payload", () => {
    expect(translateEvent({ type: "delta", delta: "b" }, RUN)).toMatchObject({
      delta: "b",
    });
  });

  it("maps done to run.completed and carries the final answer", () => {
    expect(translateEvent({ type: "done", answer: "끝" }, RUN)).toMatchObject({
      event: "run.completed",
      output: "끝",
    });
  });

  it("maps error to run.failed with the backend's detail", () => {
    expect(
      translateEvent({ type: "error", status: 503, detail: "LLM 미설정" }, RUN),
    ).toMatchObject({ event: "run.failed", error: "LLM 미설정" });
  });

  it("drops an unrecognised frame rather than inventing an event", () => {
    expect(translateEvent({ type: "heartbeat" }, RUN)).toBeNull();
    expect(translateEvent({}, RUN)).toBeNull();
  });

  it("stamps the run id on every translated frame", () => {
    for (const raw of [
      { type: "progress", tool: "rag", status: "running" },
      { type: "delta", text: "x" },
      { type: "done" },
      { type: "error" },
    ]) {
      expect(translateEvent(raw, RUN)?.run_id).toBe(RUN);
    }
  });
});

describe("formatSources", () => {
  it("renders cited documents as a markdown list", () => {
    const out = formatSources([
      { id: "a", title: "한경 컨센서스", source: "증권사 리포트 수집", publishedAt: "2026-06-14" },
    ]);
    expect(out).toContain("**출처**");
    expect(out).toContain("한경 컨센서스 · 증권사 리포트 수집 · 2026-06-14");
  });

  it("returns nothing when there are no sources", () => {
    expect(formatSources([])).toBe("");
    expect(formatSources(undefined)).toBe("");
    expect(formatSources("nope")).toBe("");
  });

  it("skips entries with neither a title nor an id", () => {
    expect(formatSources([{ source: "x" }])).toBe("");
  });

  it("is appended to the answer on a done frame", () => {
    const out = translateEvent(
      { type: "done", answer: "요약", sources: [{ title: "문서A" }] },
      RUN,
    );
    expect(String(out?.output)).toContain("요약");
    expect(String(out?.output)).toContain("문서A");
  });
});

describe("formatUngrounded", () => {
  it("warns when a number could not be traced to a document", () => {
    const out = formatUngrounded({ numbersGrounded: false, ungroundedNumbers: ["30%"] });
    expect(out).toContain("확인되지 않는 수치");
    expect(out).toContain("30%");
  });

  it("stays silent when the numbers are grounded", () => {
    expect(formatUngrounded({ numbersGrounded: true })).toBe("");
    expect(formatUngrounded({})).toBe("");
  });
});
