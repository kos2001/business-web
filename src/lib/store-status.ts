/**
 * What the app is holding on disk, and whether it is in a state you can trust.
 *
 * Three stores, none of which announces itself:
 *
 * - **선례 코퍼스** — filed contracts that 계약서 분석 and 협상 대책 search before
 *   answering. This is the one that changes answer quality, and the one whose
 *   failure is completely silent: a review with no precedent still reads like a
 *   review.
 * - **임시 보관** — uploads waiting to be used, deleted after 24 hours.
 * - **액션 DB** — the follow-ups that outlive a run.
 *
 * ## Why findings and not a table of numbers
 *
 * "문서 5건, 색인 있음" is true and useless. The question is whether the corpus
 * will actually be consulted on the next review, and the interesting answers to
 * that are the ones nothing currently reports:
 *
 * - A file was copied into `documents/` and never ingested, so it is on disk and
 *   invisible to search. The count says 5; BM25 knows 4.
 * - Nothing has been filed at all, so every review is answering from the model's
 *   own knowledge while looking exactly as confident as one that isn't.
 * - An upload is an hour from being swept and its owner thinks it is saved.
 *
 * Each of these is checkable, and each is worth more than the totals around it.
 */

import { readdir, stat } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CORPUS_ROOT, corpusAvailable, corpusIndexed } from "./corpus";
import { STAGING_ROOT } from "./staging";

/** Matches `sweepExpired`; staged files are removed a day after landing. */
const STAGING_TTL_MS = 24 * 60 * 60 * 1000;
/** Close enough to expiry to be worth naming. */
const EXPIRING_SOON_MS = 4 * 60 * 60 * 1000;

const ACTIONS_DB =
  process.env.ACTIONS_DB_PATH ??
  join(homedir(), ".hermes", "business-web-data", "actions.db");

export interface StoredFile {
  name: string;
  bytes: number;
  /** ISO timestamp of last modification. */
  at: string;
}

export interface StoreFinding {
  severity: "urgent" | "attention" | "info";
  title: string;
  why: string;
}

export interface CorpusStatus {
  /** docparser present — without it nothing can be ingested or searched. */
  available: boolean;
  /** An index has been built at least once. */
  indexed: boolean;
  /** When the index was last rebuilt, or null when there is none. */
  indexedAt: string | null;
  documents: StoredFile[];
  bytes: number;
  /** Files newer than the index: on disk, absent from search. */
  unindexed: string[];
  root: string;
}

export interface StagingStatus {
  files: (StoredFile & { session: string; expiresAt: string })[];
  bytes: number;
  /** Under four hours from being swept. */
  expiringSoon: number;
  root: string;
}

export interface ActionsDbStatus {
  exists: boolean;
  bytes: number;
  path: string;
  /** Present only when the caller supplies counts; this module does not query. */
  rows: number | null;
}

export interface StoreStatus {
  corpus: CorpusStatus;
  staging: StagingStatus;
  actions: ActionsDbStatus;
  findings: StoreFinding[];
}

async function filesIn(dir: string): Promise<StoredFile[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => !n.startsWith("."));
  } catch {
    return [];
  }
  const out: StoredFile[] = [];
  for (const name of names) {
    try {
      const s = await stat(join(dir, name));
      if (!s.isFile()) continue;
      out.push({ name, bytes: s.size, at: s.mtime.toISOString() });
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

function mtimeOf(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

export async function corpusStatus(): Promise<CorpusStatus> {
  const documents = await filesIn(join(CORPUS_ROOT, "documents"));
  const indexAt = mtimeOf(join(CORPUS_ROOT, "data", "bm25.pkl"));

  // A file modified after the index was built is not in it. Comparing mtimes
  // rather than parsing the index keeps this cheap and, more importantly, keeps
  // it honest — it cannot claim a document is indexed because the name looks
  // familiar.
  const unindexed =
    indexAt === null
      ? documents.map((d) => d.name)
      : documents.filter((d) => Date.parse(d.at) > indexAt).map((d) => d.name);

  return {
    available: corpusAvailable(),
    indexed: corpusIndexed(),
    indexedAt: indexAt === null ? null : new Date(indexAt).toISOString(),
    documents,
    bytes: documents.reduce((n, d) => n + d.bytes, 0),
    unindexed,
    root: CORPUS_ROOT,
  };
}

export async function stagingStatus(now = Date.now()): Promise<StagingStatus> {
  let sessions: string[];
  try {
    sessions = (await readdir(STAGING_ROOT)).filter((n) => !n.startsWith("."));
  } catch {
    return { files: [], bytes: 0, expiringSoon: 0, root: STAGING_ROOT };
  }

  const files: StagingStatus["files"] = [];
  for (const session of sessions) {
    for (const f of await filesIn(join(STAGING_ROOT, session))) {
      files.push({
        ...f,
        session,
        expiresAt: new Date(Date.parse(f.at) + STAGING_TTL_MS).toISOString(),
      });
    }
  }
  files.sort((a, b) => b.at.localeCompare(a.at));

  return {
    files,
    bytes: files.reduce((n, f) => n + f.bytes, 0),
    expiringSoon: files.filter(
      (f) => Date.parse(f.expiresAt) - now < EXPIRING_SOON_MS,
    ).length,
    root: STAGING_ROOT,
  };
}

export function actionsDbStatus(rows: number | null = null): ActionsDbStatus {
  const bytes = existsSync(ACTIONS_DB) ? (mtimeOf(ACTIONS_DB) === null ? 0 : statSync(ACTIONS_DB).size) : 0;
  return { exists: existsSync(ACTIONS_DB), bytes, path: ACTIONS_DB, rows };
}

/**
 * The things worth acting on, ordered by how much they cost to ignore.
 *
 * Silence here means the stores are fine — there is deliberately no "모두 정상"
 * entry, because a list that always has something in it stops being read.
 */
export function storeFindings(
  corpus: CorpusStatus,
  staging: StagingStatus,
): StoreFinding[] {
  const out: StoreFinding[] = [];

  if (!corpus.available) {
    out.push({
      severity: "urgent",
      title: "docparser 를 찾을 수 없습니다",
      why: "선례를 넣을 수도 찾을 수도 없습니다. 계약 검토는 계속 답하지만 과거 계약을 근거로 쓰지 못합니다.",
    });
  } else if (corpus.documents.length === 0) {
    out.push({
      severity: "attention",
      title: "선례가 한 건도 없습니다",
      why: "검토와 대책이 '지난번엔 어떻게 합의했나'에 답할 근거가 없습니다. 지금은 모델이 아는 일반론으로만 답하며, 그 답도 똑같이 자신 있게 보입니다.",
    });
  } else if (corpus.unindexed.length > 0) {
    // The silent one. The file is on disk, the count includes it, and search
    // will never return it.
    out.push({
      severity: "urgent",
      title: `색인되지 않은 문서 ${corpus.unindexed.length}건`,
      why: "파일은 있는데 검색에 잡히지 않습니다. 문서 수는 늘었지만 검토는 이 문서를 못 봅니다 — 다시 색인해야 합니다.",
    });
  }

  if (staging.expiringSoon > 0) {
    out.push({
      severity: "attention",
      title: `곧 삭제될 임시 파일 ${staging.expiringSoon}건`,
      why: "올린 지 24시간이 지나면 지워집니다. 계속 쓸 계약서라면 선례로 올려 두세요.",
    });
  }

  return out;
}

export async function collectStoreStatus(rows: number | null = null): Promise<StoreStatus> {
  const [corpus, staging] = await Promise.all([corpusStatus(), stagingStatus()]);
  return {
    corpus,
    staging,
    actions: actionsDbStatus(rows),
    findings: storeFindings(corpus, staging),
  };
}
