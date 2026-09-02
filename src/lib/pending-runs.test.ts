import { describe, expect, it } from "vitest";
import { claim, reserve } from "./pending-runs";

describe("pending-runs", () => {
  it("returns the reserved prompt to the first claimer", () => {
    reserve("r1", { prompt: "질문", sessionId: "s1", kind: "chat" });
    expect(claim("r1")).toMatchObject({ prompt: "질문", sessionId: "s1" });
  });

  it("is single-use so a replayed events request cannot re-run the prompt", () => {
    reserve("r2", { prompt: "질문", kind: "chat" });
    expect(claim("r2")).toBeDefined();
    expect(claim("r2")).toBeUndefined();
  });

  it("returns undefined for a run it never saw", () => {
    expect(claim("never-reserved")).toBeUndefined();
  });

  it("carries the job kind so the events route knows which pipeline to run", () => {
    reserve("r3", { prompt: "2026-09 1주차", kind: "report" });
    expect(claim("r3")?.kind).toBe("report");
  });
});
