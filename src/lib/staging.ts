/**
 * Staging area for uploaded documents.
 *
 * hermes's `/v1/runs` refuses `file` / `input_file` content parts outright
 * ("uploaded files and document inputs are not supported on this endpoint") —
 * only text and images get through. What the agent *can* do is read a path off
 * disk with its `read_file` tool. So an upload here means: write the bytes to a
 * directory the agent can reach, then name that path in the prompt. Verified
 * against a live doc-parser run.
 *
 * **This requires the web server and the hermes agent to share a filesystem.**
 * True for the current localhost deployment. If business-web is ever moved to a
 * different host from the agents, uploads break and this module is what has to
 * change — the rest of the app is transport-agnostic.
 *
 * Nothing here trusts the client: the filename and session id are both
 * re-sanitised server-side, the resolved path is asserted to stay inside the
 * staging root, and the size cap is enforced on the bytes actually written.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

/** Under HERMES_HOME so it lives alongside the agent that reads it. */
export const STAGING_ROOT = join(
  process.env.HERMES_HOME ?? join(homedir(), ".hermes"),
  "business-web-staging",
);

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Sweep staged files older than this on each upload. */
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Extensions the agents can actually do something with. An allowlist rather
 * than a denylist: the failure mode of a missed dangerous extension is worse
 * than the failure mode of a missing useful one.
 */
export const ALLOWED_EXTENSIONS = new Set([
  // 한글 (.hwp/.hwpx) is deliberately absent. It was accepted for a while with
  // nothing able to read it, so the file reached the agent as a ZIP or an OLE
  // container and the analysis was of the bytes — indistinguishable from a real
  // review. Refusing at the door is the honest version of not supporting it.
  ".pdf", ".docx", ".doc", ".rtf",
  ".txt", ".md", ".csv", ".tsv", ".json", ".xml",
  ".xlsx", ".xls", ".pptx", ".ppt",
  ".png", ".jpg", ".jpeg", ".webp", ".gif",
]);

export class StagingError extends Error {}

/**
 * Reduce one path component to something that cannot escape its directory.
 * Mirrors the desktop app's `sanitizeSegment` — same threat, same answer.
 */
export function sanitizeSegment(value: string, fallback: string): string {
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "_")
    .replace(/\.{2,}/g, ".")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned.slice(0, 120);
}

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot).toLowerCase() : "";
}

export interface StagedFile {
  /** Absolute path handed to the agent — the parsed sidecar when one exists. */
  path: string;
  /** True when `path` points at parsed Markdown rather than the raw upload. */
  parsed?: boolean;
  /** Extra path worth naming in the prompt (e.g. extracted tables). */
  extraPaths?: string[];
  /** Why parsing was skipped or failed. Shown to the user. */
  note?: string;
  /** Sanitised name, shown in the UI. */
  name: string;
  bytes: number;
  sha256: string;
}

export async function stageUpload(
  sessionId: string,
  filename: string,
  data: Uint8Array,
): Promise<StagedFile> {
  if (data.byteLength === 0) throw new StagingError("빈 파일입니다.");
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new StagingError(
      `파일이 너무 큽니다 (최대 ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB).`,
    );
  }

  const safeName = sanitizeSegment(filename, "upload");
  const ext = extensionOf(safeName);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new StagingError(`지원하지 않는 파일 형식입니다: ${ext || "(확장자 없음)"}`);
  }

  const dir = join(STAGING_ROOT, sanitizeSegment(sessionId, "default"));
  await mkdir(dir, { recursive: true, mode: 0o700 });

  // A random prefix rather than a collision loop: two uploads of the same name
  // in one session are a normal thing to do, and the UI shows the clean name.
  const target = join(dir, `${randomUUID().slice(0, 8)}-${safeName}`);
  assertInsideRoot(target);

  await writeFile(target, data, { mode: 0o600 });
  void sweepExpired().catch(() => undefined); // best-effort, never blocks upload

  return {
    path: target,
    name: safeName,
    bytes: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

/** Defence in depth: refuse anything that resolved outside the staging root. */
export function assertInsideRoot(candidate: string): void {
  const root = resolve(STAGING_ROOT);
  const full = resolve(candidate);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new StagingError("Refusing to write outside the staging root.");
  }
}

/** Drops session directories untouched for longer than the TTL. */
export async function sweepExpired(now = Date.now()): Promise<number> {
  let removed = 0;
  let entries: string[];
  try {
    entries = await readdir(STAGING_ROOT);
  } catch {
    return 0; // nothing staged yet
  }

  for (const entry of entries) {
    const dir = join(STAGING_ROOT, entry);
    try {
      const info = await stat(dir);
      if (now - info.mtimeMs > TTL_MS) {
        await rm(dir, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      /* raced with another sweep — fine */
    }
  }
  return removed;
}
