import { afterAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import {
  assertInsideRoot,
  extensionOf,
  sanitizeSegment,
  STAGING_ROOT,
  stageUpload,
  StagingError,
} from "./staging";

const SESSION = "vitest-staging";

afterAll(async () => {
  await rm(`${STAGING_ROOT}/${SESSION}`, { recursive: true, force: true });
});

describe("sanitizeSegment", () => {
  it("keeps an ordinary filename readable", () => {
    expect(sanitizeSegment("계약서 v2.pdf", "x")).toBe("계약서_v2.pdf");
  });

  it("strips path separators so a name cannot escape its directory", () => {
    expect(sanitizeSegment("../../etc/passwd", "x")).not.toContain("/");
    expect(sanitizeSegment("..\\..\\win.ini", "x")).not.toContain("\\");
  });

  it("collapses dot runs that could rebuild a traversal", () => {
    expect(sanitizeSegment("....//....//x", "x")).not.toContain("..");
  });

  it("falls back when nothing survives sanitising", () => {
    expect(sanitizeSegment("..", "fallback")).toBe("fallback");
    expect(sanitizeSegment("///", "fallback")).toBe("fallback");
    expect(sanitizeSegment("", "fallback")).toBe("fallback");
  });

  it("drops control characters", () => {
    expect(sanitizeSegment("abc.txt", "x")).toBe("abc.txt");
  });
});

describe("extensionOf", () => {
  it("lowercases the extension", () => {
    expect(extensionOf("A.PDF")).toBe(".pdf");
  });

  it("returns empty for a dotfile or a bare name", () => {
    expect(extensionOf("README")).toBe("");
    expect(extensionOf(".bashrc")).toBe("");
  });
});

describe("assertInsideRoot", () => {
  it("accepts a path under the staging root", () => {
    expect(() => assertInsideRoot(`${STAGING_ROOT}/s/f.pdf`)).not.toThrow();
  });

  it("rejects a traversal out of the root", () => {
    expect(() => assertInsideRoot(`${STAGING_ROOT}/../escape.pdf`)).toThrow(StagingError);
  });

  it("rejects a sibling directory sharing the root's prefix", () => {
    expect(() => assertInsideRoot(`${STAGING_ROOT}-evil/f.pdf`)).toThrow(StagingError);
  });
});

describe("stageUpload", () => {
  it("writes the bytes 0600 and reports a matching digest", async () => {
    const bytes = new TextEncoder().encode("제3조 (해지)");
    const staged = await stageUpload(SESSION, "계약서.txt", bytes);

    expect(staged.name).toBe("계약서.txt");
    expect(staged.bytes).toBe(bytes.byteLength);
    expect(readFileSync(staged.path, "utf-8")).toBe("제3조 (해지)");
    if (process.platform !== "win32") {
      expect(statSync(staged.path).mode & 0o777).toBe(0o600);
    }
  });

  it("keeps a traversal filename inside the session directory", async () => {
    const staged = await stageUpload(SESSION, "../../escape.txt", new Uint8Array([1]));
    expect(staged.path.startsWith(`${STAGING_ROOT}/${SESSION}/`)).toBe(true);
  });

  it("rejects an extension outside the allowlist", async () => {
    await expect(
      stageUpload(SESSION, "run.sh", new Uint8Array([1])),
    ).rejects.toThrow(StagingError);
  });

  it("rejects an empty file", async () => {
    await expect(stageUpload(SESSION, "a.txt", new Uint8Array())).rejects.toThrow(
      StagingError,
    );
  });

  it("does not collide when the same name is uploaded twice", async () => {
    const a = await stageUpload(SESSION, "dup.txt", new Uint8Array([1]));
    const b = await stageUpload(SESSION, "dup.txt", new Uint8Array([2]));
    expect(a.path).not.toBe(b.path);
  });
});
