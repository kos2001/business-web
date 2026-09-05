/**
 * Document parsing at upload time, via `~/gitspace/docparser`.
 *
 * ## Why not the agent's own tools
 *
 * docparser ships an MCP server, and the profile config even declares it — but
 * this deployment runs the internal hardened hermes distribution, whose own
 * description is "a2g/dtgpt only, **no MCP**". The declaration is inert; asking
 * the agent to call `docparser_to_markdown` gets "툴 없음". So the parse happens
 * here instead, in the upload path, before the agent ever sees the file.
 *
 * That turns out to be the better shape anyway:
 *
 * - **Deterministic.** Every upload of a given type is parsed the same way,
 *   rather than depending on whether the model decided to reach for a tool.
 * - **Once, not per turn.** A ten-turn conversation about one contract parses
 *   it once.
 * - **Tables survive.** `read_file` on a .docx yields XML soup and on a PDF
 *   yields a flat text layer; contract clause tables and price tables are
 *   exactly the content that loses its structure that way.
 *
 * The agent still reads a file off disk — it just reads clean Markdown.
 *
 * ## Failure is not fatal
 *
 * If docparser is missing, times out, or throws, the upload still succeeds and
 * the agent gets the original path. A worse parse beats a failed upload: the
 * previous behaviour (raw path only) remains the floor, never the ceiling.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const DOCPARSER_DIR =
  process.env.DOCPARSER_DIR ?? join(homedir(), "gitspace", "docparser");
const PYTHON = join(DOCPARSER_DIR, ".venv", "bin", "python");

/**
 * Types docparser converts meaningfully. Plain text and Markdown are excluded
 * on purpose — they are already readable, and a round trip only risks mangling
 * them. Images are excluded because to_markdown has nothing to say about them.
 */
const PARSEABLE = new Set([".pdf", ".docx", ".doc", ".pptx", ".ppt", ".html", ".htm"]);

/** Docling on a long PDF is slow; past this the raw file is the better answer. */
const TIMEOUT_MS = 90_000;

export function isParseable(extension: string): boolean {
  return PARSEABLE.has(extension.toLowerCase());
}

export function docparserAvailable(): boolean {
  return existsSync(PYTHON);
}

export interface ParseResult {
  /** Path the agent should read. The Markdown when parsing worked. */
  path: string;
  /** True when `path` is a parsed sidecar rather than the original upload. */
  parsed: boolean;
  /** Why parsing was skipped or failed — surfaced to the user, not swallowed. */
  note?: string;
}

/**
 * Converts `source` to a Markdown sidecar next to it and returns the path to
 * read. Never throws.
 */
export async function parseToMarkdown(
  source: string,
  extension: string,
): Promise<ParseResult> {
  if (!isParseable(extension)) {
    return {
      path: source,
      parsed: false,
      // Saying so matters: an unparsed binary reaching the agent produces an
      // analysis of the bytes, which reads exactly like an analysis of the
      // document.
      note: `${extension} 는 변환할 수 없어 원본 그대로 전달합니다. 내용을 읽지 못할 수 있습니다.`,
    };
  }
  if (!docparserAvailable()) {
    return {
      path: source,
      parsed: false,
      note: "docparser가 설치되어 있지 않아 원본 그대로 전달합니다.",
    };
  }

  const target = `${source}.md`;
  // Passing the paths as argv rather than interpolating them into a script:
  // filenames here are user-supplied, and the staging sanitiser is not a
  // defence you want to be the only one.
  const script = [
    "import sys",
    "sys.path.insert(0, sys.argv[1])",
    "from docparser.parser import to_markdown",
    "open(sys.argv[3], 'w', encoding='utf-8').write(to_markdown(sys.argv[2]))",
  ].join("\n");

  try {
    await run(PYTHON, ["-c", script, join(DOCPARSER_DIR, "src"), source, target], {
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    return existsSync(target)
      ? { path: target, parsed: true }
      : { path: source, parsed: false, note: "변환 결과가 비어 원본을 전달합니다." };
  } catch (err) {
    const timedOut =
      typeof err === "object" && err !== null && "killed" in err && err.killed;
    return {
      path: source,
      parsed: false,
      note: timedOut
        ? "문서 변환이 시간을 초과해 원본을 전달합니다."
        : "문서 변환에 실패해 원본을 전달합니다.",
    };
  }
}

/**
 * Extracts every table in a .docx as JSON, written beside the source.
 *
 * Separate from `parseToMarkdown` because a contract's obligations often live
 * in a table (단가표, 수량 약정, SLA) and flattening those into prose is where
 * a review quietly loses the numbers it is supposed to be checking.
 */
export async function extractTables(source: string): Promise<string | null> {
  if (!docparserAvailable() || !source.toLowerCase().endsWith(".docx")) return null;

  const target = `${source}.tables.json`;
  // `extract_tables` is a DocxToolkit method, not a module function, and it is
  // python-docx based — hence .docx only, which the guard above enforces.
  const script = [
    "import sys",
    "sys.path.insert(0, sys.argv[1])",
    "from docparser.tools import DocxToolkit",
    "open(sys.argv[3], 'w', encoding='utf-8').write(DocxToolkit().extract_tables(sys.argv[2]))",
  ].join("\n");

  try {
    await run(PYTHON, ["-c", script, join(DOCPARSER_DIR, "src"), source, target], {
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    return existsSync(target) ? target : null;
  } catch {
    return null;
  }
}

/** Writes a note beside the upload explaining what the agent is looking at. */
export async function writeParseNote(target: string, body: string): Promise<void> {
  await writeFile(`${target}.note.txt`, body, "utf-8").catch(() => undefined);
}

