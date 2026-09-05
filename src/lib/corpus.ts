/**
 * A searchable corpus of past contracts, built with docparser's BM25 + graph
 * index.
 *
 * ## What this is for
 *
 * Reviewing one contract in isolation answers "is this clause bad". It cannot
 * answer the questions that actually decide a negotiation:
 *
 * - 우리 표준 계약서와 무엇이 다른가
 * - 지난 계약들에서 이 조항을 어떻게 합의했는가
 * - 이 고객과 전에 합의한 조건은 무엇인가
 *
 * Those need several contracts at once, which is what the index provides.
 *
 * ## Why a separate index
 *
 * docparser defaults to one index at `./data` + `./graphify-out` inside its own
 * repo, and that one already holds hardware datasheets. Ingesting contracts
 * into it would mix the two: a search for "지연배상" would compete with pin-out
 * tables, and BM25 has no notion of which corpus a chunk belongs to. So this
 * points `DATA_DIR` / `GRAPHIFY_OUT` at business-web's own directory.
 *
 * ## Not the same thing as an upload
 *
 * An upload (`src/lib/docparse.ts`) is one document for one conversation, parsed
 * and thrown at the agent. The corpus is deliberate and durable: someone decides
 * a contract is worth keeping as precedent. Keeping them separate matters —
 * every draft a rep happens to open should not silently become "our precedent".
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const DOCPARSER_DIR =
  process.env.DOCPARSER_DIR ?? join(homedir(), "gitspace", "docparser");
const PYTHON = join(DOCPARSER_DIR, ".venv", "bin", "python");

/** business-web's own index, kept out of docparser's datasheet corpus. */
export const CORPUS_ROOT =
  process.env.CONTRACT_CORPUS_DIR ??
  join(homedir(), ".hermes", "business-web-corpus");

const DOCS_DIR = join(CORPUS_ROOT, "documents");
const DATA_DIR = join(CORPUS_ROOT, "data");
const GRAPH_DIR = join(CORPUS_ROOT, "graphify-out");

/** Ingest walks the whole corpus and can be slow; searching is fast. */
const INGEST_TIMEOUT_MS = 10 * 60_000;
const SEARCH_TIMEOUT_MS = 30_000;

function env(): NodeJS.ProcessEnv {
  return { ...process.env, DATA_DIR, GRAPHIFY_OUT: GRAPH_DIR };
}

export function corpusAvailable(): boolean {
  return existsSync(PYTHON);
}

/** True once something has been ingested — search before that returns nothing. */
export function corpusIndexed(): boolean {
  return existsSync(join(DATA_DIR, "bm25.pkl"));
}

export async function corpusDocuments(): Promise<string[]> {
  try {
    return (await readdir(DOCS_DIR)).filter((f) => !f.startsWith("."));
  } catch {
    return [];
  }
}

export interface IngestResult {
  ok: boolean;
  documents: number;
  message: string;
}

/**
 * Copies `source` into the corpus and rebuilds the index.
 *
 * Rebuilds the whole thing rather than appending: docparser's CLI has no
 * incremental mode, and a corpus of past contracts is small enough (tens of
 * documents) that correctness beats cleverness here.
 */
export async function ingestDocument(
  source: string,
  displayName: string,
): Promise<IngestResult> {
  if (!corpusAvailable()) {
    return { ok: false, documents: 0, message: "docparser가 설치되어 있지 않습니다." };
  }

  await mkdir(DOCS_DIR, { recursive: true, mode: 0o700 });

  // Copy with the human-readable name: search results show filenames, and a
  // staging uuid prefix tells the reader nothing.
  const target = join(DOCS_DIR, basename(displayName));
  try {
    await run("/bin/cp", [source, target], { timeout: 30_000 });
  } catch {
    return { ok: false, documents: 0, message: "코퍼스에 파일을 복사하지 못했습니다." };
  }

  try {
    await run(join(DOCPARSER_DIR, ".venv", "bin", "docparser"), ["ingest", DOCS_DIR], {
      cwd: DOCPARSER_DIR,
      env: env(),
      timeout: INGEST_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 160) : "";
    return { ok: false, documents: 0, message: `색인에 실패했습니다. ${detail}` };
  }

  const docs = await corpusDocuments();
  return {
    ok: true,
    documents: docs.length,
    message: `색인 완료 — 계약서 ${docs.length}건`,
  };
}

/**
 * Rebuilds the index over whatever is already in `documents/`.
 *
 * `ingestDocument` re-indexes as a side effect of adding a file, which covers
 * the normal path and nothing else. A file copied into the directory by hand —
 * or an ingest that failed halfway — leaves documents on disk that search will
 * never return, and until now there was no way to fix that from the app.
 */
export async function reindexCorpus(): Promise<IngestResult> {
  if (!corpusAvailable()) {
    return { ok: false, documents: 0, message: "docparser가 설치되어 있지 않습니다." };
  }
  const docs = await corpusDocuments();
  if (docs.length === 0) {
    return { ok: false, documents: 0, message: "색인할 문서가 없습니다." };
  }
  try {
    await run(join(DOCPARSER_DIR, ".venv", "bin", "docparser"), ["ingest", DOCS_DIR], {
      cwd: DOCPARSER_DIR,
      env: env(),
      timeout: INGEST_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 160) : "";
    return { ok: false, documents: docs.length, message: `색인에 실패했습니다. ${detail}` };
  }
  return { ok: true, documents: docs.length, message: `색인 완료 — 계약서 ${docs.length}건` };
}

export interface CorpusHit {
  /** The matched passage. */
  text: string;
  /** Filename it came from — the citation a reviewer needs. */
  document: string;
  section?: string;
}

/**
 * Hybrid BM25 + graph retrieval over the corpus. No LLM involved — this is
 * retrieval, and the agent does the reasoning with what comes back.
 */
export async function searchCorpus(query: string, topK = 5): Promise<CorpusHit[]> {
  if (!corpusAvailable() || !corpusIndexed()) return [];

  try {
    const { stdout } = await run(
      join(DOCPARSER_DIR, ".venv", "bin", "docparser"),
      ["search", query, "-k", String(topK)],
      {
        cwd: DOCPARSER_DIR,
        env: env(),
        timeout: SEARCH_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return parseHits(stdout);
  } catch {
    return [];
  }
}

/**
 * docparser prints one JSON array carrying scores, graph neighbours and bbox
 * data. Handing that to a model whole buries the two fields that matter — the
 * passage and which contract it came from — under scoring internals it cannot
 * use and will try to interpret anyway.
 */
export function parseHits(stdout: string): CorpusHit[] {
  const start = stdout.indexOf("[");
  if (start === -1) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(stdout.slice(start));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const hits: CorpusHit[] = [];
  for (const item of raw) {
    const payload = (item as { payload?: Record<string, unknown> })?.payload;
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!text || seen.has(text)) continue;
    // A heading matches the query as readily as a clause does and carries no
    // terms — "A사_공급계약_2026" is a filename, not a precedent. Filter on the
    // chunk kind docling assigns rather than on length, which lets long
    // document titles through and drops short but real clauses.
    if (payload?.kind === "heading") continue;
    seen.add(text);

    const source = typeof payload?.source === "string" ? payload.source : "";
    hits.push({
      text,
      document: source ? source.split("/").pop()! : "(출처 미상)",
      // Docling escapes underscores for Markdown; undo it for display.
      section:
        typeof payload?.section === "string"
          ? payload.section.replace(/\\_/g, "_")
          : undefined,
    });
  }
  return hits;
}
