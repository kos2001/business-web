/**
 * The run registry for the proxied backends (mi-report, marketing-agent).
 *
 * ## Why this exists
 *
 * hermes splits starting a run from watching it: `POST /v1/runs` begins
 * execution and the event request merely attaches, so it can attach as often as
 * it likes. The proxied backends have no such split — mi-report's
 * `/agent/chat/stream` is one request that streams the answer, and
 * marketing-agent's `/pipeline/run` is one request that blocks for minutes. To
 * keep a single shape in the browser, `POST /api/runs` reserves a run id and
 * parks the prompt here, and the events request is what actually calls the
 * backend.
 *
 * ## What this module had to fix
 *
 * The prompt used to be single-use: the first events request took it and
 * deleted it, so a *second* request for the same run id got
 * `Run not found or already streamed`. That fired constantly —
 * React StrictMode double-invokes effects in dev, and any refresh mid-run threw
 * the run away for good.
 *
 * Making the prompt re-claimable would have been worse: each attach would kick
 * off another run of a pipeline that costs minutes and real money.
 *
 * So the run is started **once** and **recorded**. Every client — including the
 * first — reads through `replay()`, which emits the frames captured so far and
 * then follows the live tail. A refresh mid-run therefore rejoins the same run
 * from the beginning rather than restarting or failing.
 *
 * The recorder is deliberately **not** tied to the client's request signal. A
 * closed tab must not kill a pipeline that a refresh is about to reattach to;
 * cancellation is an explicit act, which is what the stop endpoint is for.
 *
 * ## Limits
 *
 * State is in memory, so this assumes a single Next.js instance — true of the
 * current localhost deployment. Behind more than one replica it needs a sticky
 * session or a shared store, and this module is what changes. It survives dev
 * hot reload (see `store()`) but not a server restart.
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

type Status = "reserved" | "running" | "done";

interface Record_ {
  run: PendingRun;
  status: Status;
  /** Every SSE chunk the backend produced, in order, for replay. */
  frames: Uint8Array[];
  /** Readers following the live tail. */
  waiters: Set<(chunk: Uint8Array | null) => void>;
  /** Set when the backend failed, so a late attach learns why. */
  failure?: string;
  /** Last write, used by the sweeper rather than creation time. */
  touchedAt: number;
}

/** Never started — the events request never arrived. */
const RESERVED_TTL_MS = 5 * 60 * 1000;
/** Finished — kept so a refresh can still replay the answer. */
const DONE_TTL_MS = 30 * 60 * 1000;

/**
 * Next's dev server re-evaluates modules on hot reload, which would drop every
 * in-flight run on an unrelated file save. Hanging the map off globalThis keeps
 * it across reloads; in production the module is evaluated once and this is
 * just a map.
 */
function store(): Map<string, Record_> {
  const g = globalThis as typeof globalThis & {
    __businessWebRuns?: Map<string, Record_>;
  };
  g.__businessWebRuns ??= new Map();
  return g.__businessWebRuns;
}

export function reserve(
  runId: string,
  run: Omit<PendingRun, "createdAt">,
): void {
  sweep();
  const now = Date.now();
  store().set(runId, {
    run: { ...run, createdAt: now },
    status: "reserved",
    frames: [],
    waiters: new Set(),
    touchedAt: now,
  });
}

/**
 * Hand the prompt over for execution — **once**. Returns undefined for a run
 * that is unknown, or already started by an earlier request; that second case
 * is not an error, it means the caller should `replay()` instead.
 */
export function claimForStart(runId: string): PendingRun | undefined {
  sweep();
  const rec = store().get(runId);
  if (!rec || rec.status !== "reserved") return undefined;
  rec.status = "running";
  rec.touchedAt = Date.now();
  return rec.run;
}

/** Whether the id is known at all — the difference between 404 and a replay. */
export function isKnown(runId: string): boolean {
  sweep();
  return store().has(runId);
}

/**
 * Pump a backend's stream into the record, detached from any client.
 *
 * Not awaited by the caller: the recording has to outlive the request that
 * started it, or closing the tab would end the run.
 */
export function startRecording(
  runId: string,
  source: ReadableStream<Uint8Array>,
): void {
  const rec = store().get(runId);
  if (!rec) return;

  void (async () => {
    const reader = source.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          rec.frames.push(value);
          rec.touchedAt = Date.now();
          for (const notify of rec.waiters) notify(value);
        }
      }
    } catch (err) {
      rec.failure = err instanceof Error ? err.message : String(err);
    } finally {
      rec.status = "done";
      rec.touchedAt = Date.now();
      for (const notify of rec.waiters) notify(null);
      rec.waiters.clear();
    }
  })();
}

/**
 * A stream of everything this run has produced, then its live tail.
 *
 * `signal` belongs to the *client*: aborting it detaches this reader and leaves
 * the recording running for whoever attaches next.
 */
export function replay(
  runId: string,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> | undefined {
  const rec = store().get(runId);
  if (!rec) return undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        rec.waiters.delete(notify);
        try {
          controller.close();
        } catch {
          /* already closed by an abort */
        }
      };

      function notify(chunk: Uint8Array | null) {
        if (closed) return;
        if (chunk === null) {
          close();
          return;
        }
        try {
          controller.enqueue(chunk);
        } catch {
          close();
        }
      }

      // Everything captured before this reader arrived.
      for (const frame of rec.frames) {
        try {
          controller.enqueue(frame);
        } catch {
          return;
        }
      }

      if (rec.status === "done") {
        close();
        return;
      }

      rec.waiters.add(notify);
      signal?.addEventListener("abort", close, { once: true });
    },
  });
}

/** Drops runs nobody is coming back for. */
function sweep(now = Date.now()): void {
  for (const [id, rec] of store()) {
    if (rec.status === "running") continue; // never evict a live run
    const ttl = rec.status === "done" ? DONE_TTL_MS : RESERVED_TTL_MS;
    if (now - rec.touchedAt > ttl) store().delete(id);
  }
}

/** Test seam. */
export function _size(): number {
  return store().size;
}

/** Test seam — the registry outlives a module reload, so tests must reset it. */
export function _reset(): void {
  store().clear();
}
