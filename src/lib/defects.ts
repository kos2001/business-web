/**
 * Remembering what the checks keep finding.
 *
 * ## The loop this closes
 *
 * The verification layer finds a defect, shows it under the answer, and forgets
 * it. Every run rediscovers the same problems from scratch, and nobody can tell
 * a one-off from a habit — which is the only distinction that matters, because
 * they call for different responses. A one-off is bad luck. A defect that
 * appears eight times is an instruction problem, and instructions are fixable.
 *
 * That loop has been run by hand twice in this project already. 배상율 for
 * 배상률 kept appearing until a rule went into the SOUL; the legal brief cited
 * the wrong statute number until the playbook banned statute numbers outright.
 * Both times the expensive part was not writing the rule — it was noticing that
 * the thing recurred. This does the noticing.
 *
 * ## Why it does not write the rules
 *
 * It records and groups; a person writes the rule. A system that edits its own
 * instructions in response to its own output has no outside check on either,
 * and the failure mode is a prompt that drifts in a direction nobody chose.
 * Same reasoning as never rewriting an answer: surface it, let a person decide.
 *
 * ## Where a rule belongs
 *
 * The most useful thing the grouping produces is not the count but the spread.
 * A defect in one workspace is that playbook's problem. The same defect across
 * five is the shared profile's — the model's habit, not the playbook's — and a
 * rule written into one playbook would fix a fifth of it.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DB_PATH =
  process.env.DEFECTS_DB_PATH ??
  join(homedir(), ".hermes", "business-web-data", "defects.db");

/** Mirrors the three layers so a pattern can say which check caught it. */
export type DefectKind =
  | "spelling"
  | "broken-context"
  | "table-misread"
  | "number"
  | "repetition"
  | "foreign-script"
  | "misquote";

export interface Defect {
  id: string;
  workspace: string;
  kind: DefectKind;
  /** The offending fragment, as the check reported it. */
  quote: string;
  /** Normalised for grouping — see `normaliseQuote`. */
  key: string;
  reason: string;
  at: string;
}

let db: Database.Database | null = null;

function conn(): Database.Database {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true, mode: 0o700 });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS defects (
      id        TEXT PRIMARY KEY,
      workspace TEXT NOT NULL,
      kind      TEXT NOT NULL,
      quote     TEXT NOT NULL,
      -- The grouping key, stored rather than computed at read time so the
      -- definition of "the same defect" cannot drift between writer and reader.
      key       TEXT NOT NULL,
      reason    TEXT NOT NULL,
      at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_defects_key ON defects(key);
    CREATE INDEX IF NOT EXISTS idx_defects_at ON defects(at);
  `);
  return db;
}

/**
 * What counts as "the same defect twice".
 *
 * A misspelling recurs as the same token — 배상율, 반돋시 — so the token is the
 * key and matching is exact after normalisation. Whitespace, quotes and case
 * vary between reports of the identical problem and must not split a group.
 *
 * Long quotes are truncated rather than hashed whole: a broken-context finding
 * quotes a whole clause, and two reports of the same broken passage tend to
 * agree on its opening.
 *
 * The grouping is exact for the short-token defects that matter most — 배상율,
 * 142,00 — and unreliable for long quotes, which group only when they match on
 * their first forty characters. It will therefore under-group, which is the
 * error to prefer: a missed pattern costs one unwritten rule, while a false one
 * sends someone to write a rule for a problem that is not there.
 */
export function normaliseQuote(kind: DefectKind, quote: string, reason = ""): string {
  if (kind === "spelling") {
    const change = spellingChange(quote, reason);
    if (change) return `spelling:${change}`;
  }
  // For a wrong figure or citation the quote is wherever the mistake landed —
  // "민법 제393조", "민법 제393조 감액", "제393조에 따라 감액" are one error
  // reported three ways. What is stable is the correction, because the right
  // answer does not change with the sentence around it. Seeding the page showed
  // this: three reports of one wrong statute grouped as three patterns of one,
  // which is to say the loop could never see a recurring number error at all.
  if (kind === "number" && reason.trim()) {
    return `number:${reason.replace(/\s+/g, " ").trim().slice(0, 60)}`;
  }
  const base = quote
    .replace(/[“”"'’‘]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${kind}:${base.slice(0, 40)}`;
}

/**
 * The actual mistake inside a misspelling, as `wrong→right`.
 *
 * Keying on the quote alone was wrong, and the first live run showed why: the
 * same 율/률 habit came back as 지연배상율 twice and 연체 배상율 once, which is
 * one habit reported as two patterns of two and one — under the threshold, so
 * the loop stayed silent about the thing it exists to catch. The reviewer
 * quotes the phrase, not the token.
 *
 * The reviewer does name the correction (`'지연배상률'의 오타입니다.`), so both
 * forms are in hand. Stripping the shared prefix and suffix leaves the change
 * itself — 율→률 either way — which is the unit a rule would actually be
 * written about.
 *
 * Returns null when the two share nothing, which means this is a wrong word
 * rather than a mistyped one; the quote is the better key for that.
 */
/**
 * The slice of `wrong` that `right` is correcting.
 *
 * Returns `wrong` unchanged when nothing aligns better, so a genuinely
 * different word still falls through to the "not a typo" path below.
 */
function bestWindow(wrong: string, right: string): string {
  if (wrong.length <= right.length) return wrong;
  let best = wrong.slice(0, right.length);
  let bestScore = -1;
  for (let i = 0; i + right.length <= wrong.length; i += 1) {
    const w = wrong.slice(i, i + right.length);
    let same = 0;
    for (let j = 0; j < right.length; j += 1) if (w[j] === right[j]) same += 1;
    if (same > bestScore) {
      bestScore = same;
      best = w;
    }
  }
  // Barely overlapping means this is a different word, not a mistyped one.
  return bestScore >= Math.ceil(right.length / 2) ? best : wrong;
}

export function spellingChange(quote: string, reason: string): string | null {
  const wrong = quote.replace(/[“”"'’‘\s]/g, "");
  const right = (/[‘'"“]([^’'"”]{1,40})[’'"”]/.exec(reason)?.[1] ?? "").replace(
    /[\s]/g,
    "",
  );
  if (!wrong || !right || wrong === right) return null;

  // The reviewer quotes as much of the phrase as it likes, so the correction is
  // often shorter than the quote — "배상율 인하" corrected to "배상률". Diffing
  // them whole yielded 율인하→률 and split one habit into two patterns. Sliding
  // the correction across the quote finds the part it is actually correcting.
  const window = bestWindow(wrong, right);

  let head = 0;
  while (head < window.length && head < right.length && window[head] === right[head]) head += 1;
  let tail = 0;
  while (
    tail < window.length - head &&
    tail < right.length - head &&
    window[window.length - 1 - tail] === right[right.length - 1 - tail]
  ) {
    tail += 1;
  }

  const from = window.slice(head, window.length - tail);
  const to = right.slice(head, right.length - tail);
  // Nothing shared: a different word, not a typo of this one.
  if (!from && !to) return null;
  if (head === 0 && tail === 0) return null;
  return `${from}→${to}`;
}

export function recordDefect(input: {
  workspace: string;
  kind: DefectKind;
  quote: string;
  reason: string;
}): Defect {
  const item: Defect = {
    id: `df_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    workspace: input.workspace,
    kind: input.kind,
    quote: input.quote.slice(0, 200),
    key: normaliseQuote(input.kind, input.quote, input.reason),
    reason: input.reason.slice(0, 300),
    at: new Date().toISOString(),
  };
  conn()
    .prepare(
      `INSERT INTO defects (id,workspace,kind,quote,key,reason,at)
       VALUES (@id,@workspace,@kind,@quote,@key,@reason,@at)`,
    )
    .run(item);
  return item;
}

export interface DefectPattern {
  key: string;
  kind: DefectKind;
  /** A representative fragment, for the reader. */
  quote: string;
  reason: string;
  count: number;
  /** Which workspaces produced it — the spread is what says where a rule goes. */
  workspaces: string[];
  firstAt: string;
  lastAt: string;
  /**
   * Where a rule for this belongs.
   *
   * "profile" when it shows up across several workspaces — the twenty sharing
   * `sales-agent` share a SOUL, and a habit visible in five of them is the
   * model's, not any one playbook's.
   */
  scope: "playbook" | "profile";
}

/** Below this a defect is bad luck, not a habit worth writing a rule about. */
const RECURRING = 3;
/** Seen in this many workspaces and it belongs in the shared profile. */
const SPREAD = 3;

interface Row {
  key: string;
  kind: string;
  quote: string;
  reason: string;
  count: number;
  workspaces: string;
  firstAt: string;
  lastAt: string;
}

/**
 * Defects that have happened often enough to be worth acting on.
 *
 * `sinceDays` bounds it: a rule added last month should stop showing up as a
 * live problem once it works, and an unbounded history would keep it on the
 * list forever, which is how a list of fixed things becomes a list nobody reads.
 */
export function recurringPatterns(
  sinceDays = 30,
  minCount = RECURRING,
  /** Injectable so the window is testable without waiting a day. */
  now = Date.now(),
): DefectPattern[] {
  const since = new Date(now - sinceDays * 86_400_000).toISOString();
  const rows = conn()
    .prepare(
      `SELECT key,
              MIN(kind)   AS kind,
              MIN(quote)  AS quote,
              MIN(reason) AS reason,
              COUNT(*)    AS count,
              GROUP_CONCAT(DISTINCT workspace) AS workspaces,
              MIN(at)     AS firstAt,
              MAX(at)     AS lastAt
         FROM defects
        WHERE at >= @since
        GROUP BY key
       HAVING COUNT(*) >= @minCount
        ORDER BY count DESC, lastAt DESC`,
    )
    .all({ since, minCount }) as Row[];

  return rows.map((r) => {
    const workspaces = r.workspaces.split(",").filter(Boolean).sort();
    return {
      key: r.key,
      kind: r.kind as DefectKind,
      quote: r.quote,
      reason: r.reason,
      count: r.count,
      workspaces,
      firstAt: r.firstAt,
      lastAt: r.lastAt,
      scope: workspaces.length >= SPREAD ? "profile" : "playbook",
    };
  });
}

export interface DefectSummary {
  total: number;
  recurring: number;
  byKind: Record<string, number>;
}

export function summariseDefects(sinceDays = 30, now = Date.now()): DefectSummary {
  const since = new Date(now - sinceDays * 86_400_000).toISOString();
  const rows = conn()
    .prepare(
      `SELECT kind, COUNT(*) AS n FROM defects WHERE at >= @since GROUP BY kind`,
    )
    .all({ since }) as { kind: string; n: number }[];
  return {
    total: rows.reduce((n, r) => n + r.n, 0),
    recurring: recurringPatterns(sinceDays, RECURRING, now).length,
    byKind: Object.fromEntries(rows.map((r) => [r.kind, r.n])),
  };
}

/**
 * Test seam — lets a suite start from a known state.
 *
 * Refuses to run against a path that is not obviously a test database. This
 * function once emptied the production store on every `beforeEach` because a
 * test file imported the module statically and never set DEFECTS_DB_PATH: the wipe
 * was silent, and the loss only surfaced when a page that should have had rows
 * showed none. A loud failure is the only version of this worth having.
 */
export function _resetForTests(): void {{
  const path = DB_PATH;
  const looksLikeTest =
    /(^|\/)(tmp|temp|T)\//i.test(path) || /test|vitest/i.test(path.split("/").pop() ?? "");
  if (!looksLikeTest) {{
    throw new Error(
      `_resetForTests refused: ${{path}} is not a test database. ` +
        `Set DEFECTS_DB_PATH to a temp path before importing this module.`,
    );
  }}
  conn().exec("DELETE FROM defects");
}}
