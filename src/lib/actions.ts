/**
 * Action items — the one thing in the sales pipeline that outlives a run.
 *
 * ## Why this lives here and not in a backend
 *
 * marketing-agent already *produces* action items, but only as fields inside a
 * report: `id/title/owner/due/priority/impact/effort` and no status. The moment
 * the report renders they are frozen, and by the next diagnosis nobody knows
 * whether "다음 미팅 전에 예산 확인" actually happened. A list nobody closes
 * becomes a wishlist people stop reading.
 *
 * They could not live in marketing-agent either: that would only hold items born
 * of a diagnosis, and "법무 검토 요청" from a contract negotiation would have
 * nowhere to go. All 25 workspaces produce follow-ups, and business-web is the
 * only layer that spans them.
 *
 * ## Why SQLite
 *
 * Thousands of rows at most, one writer, and the server already owns files
 * (staging, corpus). A row here is small and the queries are trivial — the
 * database is for durability and querying by due date, not for scale.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DB_PATH =
  process.env.ACTIONS_DB_PATH ??
  join(homedir(), ".hermes", "business-web-data", "actions.db");

export type ActionStatus = "open" | "in_progress" | "done" | "dropped";
export type Level = "high" | "mid" | "low";

export interface ActionItem {
  id: string;
  title: string;
  /** NULL when the source never named one — see the note on honesty below. */
  owner: string | null;
  /** ISO date, or NULL when undecided. */
  due: string | null;
  priority: Level | null;
  impact: Level | null;
  effort: Level | null;
  status: ActionStatus;
  /** Which workspace produced it. */
  workspace: string;
  /** The passage it came from, so a stale item can be traced back. */
  sourceText: string | null;
  createdAt: string;
  updatedAt: string;
  /** Why it was dropped, or any human annotation. */
  note: string | null;
}

let db: Database.Database | null = null;

function conn(): Database.Database {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true, mode: 0o700 });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_items (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      -- owner and due are nullable on purpose. Not inventing an owner when the
      -- source never named one is the playbooks' core discipline; a NOT NULL
      -- column here would force the agent to break it to be storable.
      owner       TEXT,
      due         TEXT,
      priority    TEXT,
      impact      TEXT,
      effort      TEXT,
      status      TEXT NOT NULL DEFAULT 'open',
      workspace   TEXT NOT NULL,
      source_text TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      note        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_actions_status ON action_items(status);
    CREATE INDEX IF NOT EXISTS idx_actions_due ON action_items(due);
  `);
  return db;
}

interface Row {
  id: string;
  title: string;
  owner: string | null;
  due: string | null;
  priority: string | null;
  impact: string | null;
  effort: string | null;
  status: string;
  workspace: string;
  source_text: string | null;
  created_at: string;
  updated_at: string;
  note: string | null;
}

function toItem(r: Row): ActionItem {
  return {
    id: r.id,
    title: r.title,
    owner: r.owner,
    due: r.due,
    priority: r.priority as Level | null,
    impact: r.impact as Level | null,
    effort: r.effort as Level | null,
    status: r.status as ActionStatus,
    workspace: r.workspace,
    sourceText: r.source_text,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    note: r.note,
  };
}

export interface NewAction {
  title: string;
  workspace: string;
  owner?: string | null;
  due?: string | null;
  priority?: Level | null;
  impact?: Level | null;
  effort?: Level | null;
  sourceText?: string | null;
}

export function createAction(input: NewAction): ActionItem {
  const now = new Date().toISOString();
  const item: ActionItem = {
    id: `ai_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    title: input.title.trim(),
    owner: input.owner?.trim() || null,
    due: input.due?.trim() || null,
    priority: input.priority ?? null,
    impact: input.impact ?? null,
    effort: input.effort ?? null,
    status: "open",
    workspace: input.workspace,
    sourceText: input.sourceText?.trim() || null,
    createdAt: now,
    updatedAt: now,
  note: null,
  };
  conn()
    .prepare(
      `INSERT INTO action_items
       (id,title,owner,due,priority,impact,effort,status,workspace,source_text,created_at,updated_at,note)
       VALUES (@id,@title,@owner,@due,@priority,@impact,@effort,@status,@workspace,@sourceText,@createdAt,@updatedAt,@note)`,
    )
    .run(item);
  return item;
}

export interface ListFilter {
  status?: ActionStatus | "active";
  workspace?: string;
  /**
   * Several workspaces at once — a domain's worth.
   *
   * A stage dashboard asks "what is outstanding in 계약", and 계약 is four
   * workspaces. Looping `workspace` four times and merging in JS would lose the
   * ordering the query is responsible for, so the set goes into the SQL.
   */
  workspaces?: readonly string[];
}

/**
 * Newest first, except that anything overdue floats to the top. What is late is
 * the only thing on this list that is already costing something.
 */
export function listActions(filter: ListFilter = {}): ActionItem[] {
  const where: string[] = [];
  const params: Record<string, string> = {};

  if (filter.status === "active") {
    where.push("status IN ('open','in_progress')");
  } else if (filter.status) {
    where.push("status = @status");
    params.status = filter.status;
  }
  if (filter.workspace) {
    where.push("workspace = @workspace");
    params.workspace = filter.workspace;
  }
  if (filter.workspaces) {
    // An empty set means "no workspaces", which must return nothing rather than
    // everything — an `IN ()` is a syntax error, so it is spelled out.
    if (filter.workspaces.length === 0) return [];
    const names = filter.workspaces.map((_, i) => `@ws${i}`);
    where.push(`workspace IN (${names.join(",")})`);
    filter.workspaces.forEach((w, i) => {
      params[`ws${i}`] = w;
    });
  }

  const rows = conn()
    .prepare(
      `SELECT * FROM action_items
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       -- rowid breaks ties: capturing several actions from one answer stamps
       -- them with the same ISO timestamp, and without a monotonic tiebreak
       -- their order is whatever SQLite happens to return.
       ORDER BY created_at DESC, rowid DESC`,
    )
    .all(params) as Row[];

  const items = rows.map(toItem);
  const today = new Date().toISOString().slice(0, 10);
  const late = (i: ActionItem) =>
    i.due !== null && i.due < today && (i.status === "open" || i.status === "in_progress");
  return [...items.filter(late), ...items.filter((i) => !late(i))];
}

export function updateAction(
  id: string,
  patch: Partial<Pick<ActionItem, "status" | "owner" | "due" | "note" | "title">>,
): ActionItem | null {
  const existing = conn()
    .prepare("SELECT * FROM action_items WHERE id = ?")
    .get(id) as Row | undefined;
  if (!existing) return null;

  const next = {
    ...existing,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.owner !== undefined ? { owner: patch.owner } : {}),
    ...(patch.due !== undefined ? { due: patch.due } : {}),
    ...(patch.note !== undefined ? { note: patch.note } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    updated_at: new Date().toISOString(),
  };

  conn()
    .prepare(
      `UPDATE action_items
       SET title=@title, owner=@owner, due=@due, status=@status, note=@note, updated_at=@updated_at
       WHERE id=@id`,
    )
    .run(next);
  return toItem(next as Row);
}

export function deleteAction(id: string): boolean {
  return conn().prepare("DELETE FROM action_items WHERE id = ?").run(id).changes > 0;
}

export interface ActionSummary {
  total: number;
  open: number;
  inProgress: number;
  done: number;
  dropped: number;
  overdue: number;
  dueThisWeek: number;
  byWorkspace: Record<string, number>;
}

/** Counts for the dashboard. Overdue is the number that should drive behaviour. */
export function summarise(filter: ListFilter = {}): ActionSummary {
  const items = listActions(filter);
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const active = (i: ActionItem) => i.status === "open" || i.status === "in_progress";

  const byWorkspace: Record<string, number> = {};
  for (const i of items) {
    if (active(i)) byWorkspace[i.workspace] = (byWorkspace[i.workspace] ?? 0) + 1;
  }

  return {
    total: items.length,
    open: items.filter((i) => i.status === "open").length,
    inProgress: items.filter((i) => i.status === "in_progress").length,
    done: items.filter((i) => i.status === "done").length,
    dropped: items.filter((i) => i.status === "dropped").length,
    overdue: items.filter((i) => active(i) && i.due !== null && i.due < today).length,
    dueThisWeek: items.filter(
      (i) => active(i) && i.due !== null && i.due >= today && i.due <= weekEnd,
    ).length,
    byWorkspace,
  };
}

/** Test seam — lets a suite start from a known state. */
export function _resetForTests(): void {
  conn().exec("DELETE FROM action_items");
}
