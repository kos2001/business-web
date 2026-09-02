/**
 * Holds the prompt for a proxied-backend run between `POST /api/runs` and the
 * browser's follow-up `GET /api/runs/{id}/events`.
 *
 * hermes splits those two naturally — the run is already executing server-side
 * and the event fetch just attaches to it. The proxied backends have no such
 * split: mi-report's `/agent/chat/stream` is one request that streams the
 * answer, and marketing-agent's `/pipeline/run` is one request that blocks. To
 * keep a single shape in the browser, the POST reserves a run id and parks the
 * message here, and the events request is what actually calls the backend.
 *
 * In-memory, so this assumes a single Next.js instance. That holds for the
 * current localhost deployment; behind more than one replica, a sticky session
 * or a shared store is required and this module is what changes.
 */

export interface PendingRun {
  prompt: string;
  sessionId?: string;
  /**
   * Which job the events request should run: "chat" answers a question,
   * "report" runs mi-report's weekly-report pipeline, "diagnose" runs
   * marketing-agent's ten-agent diagnosis.
   */
  kind: "chat" | "report" | "diagnose";
  createdAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const pending = new Map<string, PendingRun>();

export function reserve(runId: string, run: Omit<PendingRun, "createdAt">): void {
  sweep();
  pending.set(runId, { ...run, createdAt: Date.now() });
}

/** Single-use: a run's prompt is claimed by the first events request. */
export function claim(runId: string): PendingRun | undefined {
  sweep();
  const found = pending.get(runId);
  if (found) pending.delete(runId);
  return found;
}

/** Drops entries whose events request never arrived (tab closed mid-run). */
function sweep(now = Date.now()): void {
  for (const [id, run] of pending) {
    if (now - run.createdAt > TTL_MS) pending.delete(id);
  }
}

/** Test seam. */
export function _size(): number {
  return pending.size;
}
