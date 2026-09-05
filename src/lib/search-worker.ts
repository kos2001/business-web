/**
 * A warm docparser process, so precedent search costs milliseconds.
 *
 * ## What the time was going on
 *
 * Every search spawned the CLI, which spent 195ms importing before it could
 * start and up to 881ms more loading the embedding model. The BM25 query itself
 * takes 1-6ms. All of that setup was thrown away when the process exited and
 * paid again on the next search — and a contract review consults precedent
 * several times.
 *
 * The worker keeps the toolkit open and answers line-delimited JSON.
 *
 * ## What can go wrong with a long-lived subprocess
 *
 * Three things, each handled rather than hoped about:
 *
 * - **It dies.** Requests in flight are rejected and the next call starts a new
 *   one. A dead worker must not become a hang.
 * - **It hangs.** Every request has a deadline. Past it the worker is killed
 *   rather than left holding a queue nobody will ever drain.
 * - **It goes stale.** Re-indexing writes a new BM25 file that the running
 *   worker will never read. The index mtime is checked before each request and
 *   a changed one restarts it — otherwise the fast path would quietly serve
 *   results from the corpus as it was an hour ago, which is worse than slow.
 *
 * Anything unrecoverable falls back to the CLI. Slower is a fine answer; wrong
 * or hanging is not.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const REQUEST_TIMEOUT_MS = 30_000;
/** Import plus, on the first query that needs it, the embedding model. */
const STARTUP_TIMEOUT_MS = 60_000;

interface Pending {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface Worker {
  proc: ChildProcessWithoutNullStreams;
  ready: Promise<void>;
  pending: Map<number, Pending>;
  /** Index mtime this worker loaded, so staleness is detectable. */
  indexAt: number;
  dead: boolean;
}

let worker: Worker | null = null;
let nextId = 1;

function indexMtime(dataDir: string): number {
  try {
    return statSync(join(dataDir, "bm25.pkl")).mtimeMs;
  } catch {
    return 0;
  }
}

export interface WorkerConfig {
  python: string;
  script: string;
  docparserSrc: string;
  cwd: string;
  dataDir: string;
  graphOut: string;
}

function start(cfg: WorkerConfig): Worker {
  const proc = spawn(cfg.python, [cfg.script], {
    cwd: cfg.cwd,
    env: {
      ...process.env,
      DOCPARSER_SRC: cfg.docparserSrc,
      DATA_DIR: cfg.dataDir,
      GRAPHIFY_OUT: cfg.graphOut,
      // Line-buffered, or responses sit in the pipe until it fills.
      PYTHONUNBUFFERED: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const w: Worker = {
    proc,
    pending: new Map(),
    indexAt: indexMtime(cfg.dataDir),
    dead: false,
    ready: Promise.resolve(),
  };

  w.ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("search worker did not start in time"));
      kill(w);
    }, STARTUP_TIMEOUT_MS);

    let buffer = "";
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;

        let msg: { id?: number; ok?: boolean; ready?: boolean; text?: string; error?: string };
        try {
          msg = JSON.parse(line) as typeof msg;
        } catch {
          continue;
        }

        if (msg.ready) {
          clearTimeout(timer);
          resolve();
          continue;
        }
        if (typeof msg.id !== "number") continue;
        const p = w.pending.get(msg.id);
        if (!p) continue;
        w.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.text ?? "");
        else p.reject(new Error(msg.error ?? "search failed"));
      }
    });
  });

  const die = () => {
    w.dead = true;
    for (const [, p] of w.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("search worker exited"));
    }
    w.pending.clear();
    if (worker === w) worker = null;
  };
  proc.on("exit", die);
  proc.on("error", die);
  // Drained so a chatty library cannot fill the pipe and wedge the process.
  proc.stderr.resume();

  return w;
}

function kill(w: Worker): void {
  w.dead = true;
  try {
    w.proc.kill("SIGKILL");
  } catch {
    // Already gone.
  }
  if (worker === w) worker = null;
}

/**
 * Runs one search on the warm worker.
 *
 * Throws rather than returning empty, so the caller can fall back to the CLI —
 * an empty result and a broken worker must not look the same to the corpus,
 * whose whole job is saying whether precedent exists.
 */
export async function searchViaWorker(
  cfg: WorkerConfig,
  query: string,
  topK: number,
): Promise<string> {
  if (!existsSync(cfg.python) || !existsSync(cfg.script)) {
    throw new Error("search worker not available");
  }

  // A rebuilt index is invisible to a running worker.
  if (worker && !worker.dead && worker.indexAt !== indexMtime(cfg.dataDir)) {
    kill(worker);
  }
  if (!worker || worker.dead) worker = start(cfg);

  const w = worker;
  await w.ready;

  const id = nextId++;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      w.pending.delete(id);
      // A worker that missed one deadline is a worker in an unknown state.
      kill(w);
      reject(new Error("search timed out"));
    }, REQUEST_TIMEOUT_MS);

    w.pending.set(id, { resolve, reject, timer });
    try {
      w.proc.stdin.write(`${JSON.stringify({ id, query, topK })}\n`);
    } catch (err) {
      clearTimeout(timer);
      w.pending.delete(id);
      reject(err instanceof Error ? err : new Error("write failed"));
    }
  });
}

/** Stops the worker — used when the corpus is re-indexed from this process. */
export function stopSearchWorker(): void {
  if (worker) kill(worker);
}
