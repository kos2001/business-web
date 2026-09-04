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
