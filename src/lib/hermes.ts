/**
 * Server-side client for hermes-gateway.
 *
 * Two invariants this module exists to enforce:
 *
 * 1. The gateway client key never reaches the browser. Every call here runs in
 *    a route handler; nothing is exported that a client component can import
 *    without pulling `process.env` in, which Next refuses to bundle.
 *
 * 2. **Every request belonging to a run carries `X-Hermes-Upstream`.** The
 *    gateway picks an upstream per request (header > model alias > model prefix
 *    > default). A run started on `mi-report` whose event stream is fetched
 *    without the header lands on the default upstream, which has never heard of
 *    that run_id and answers 404 `run_not_found`. Verified against a live
 *    gateway; it is the first thing that breaks when someone "simplifies" this.
 */

const BASE = process.env.HERMES_GATEWAY_URL ?? "http://127.0.0.1:8700";

function clientKey(): string {
  const key = process.env.HERMES_GATEWAY_KEY;
  if (!key) {
    throw new Error(
      "HERMES_GATEWAY_KEY is not set. Copy .env.example to .env.local and fill " +
        "it from GATEWAY_CLIENT_KEYS in ~/gitspace/AIFde/.env.",
    );
  }
  return key;
}

function headers(upstream: string, extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("Authorization", `Bearer ${clientKey()}`);
  h.set("X-Hermes-Upstream", upstream); // invariant 2 — see module docs
  return h;
}

export interface StartRunInput {
  upstream: string;
  model: string;
  input: string;
  /** Prior turns, oldest first. hermes prefers this over previous_response_id. */
  history?: { role: string; content: string }[];
  /** Stable per-workspace id so hermes scopes its long-term memory correctly. */
  sessionId?: string;
  /**
   * Ephemeral system prompt for this run. Several workspaces share the
   * `sales-agent` profile, and this is what points each at its own skill.
   */
  instructions?: string;
}

export interface StartRunResult {
  run_id: string;
  status: string;
}

export async function startRun(input: StartRunInput): Promise<StartRunResult> {
  const res = await fetch(`${BASE}/v1/runs`, {
    method: "POST",
    headers: headers(input.upstream, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      input: input.input,
      model: input.model,
      ...(input.instructions ? { instructions: input.instructions } : {}),
      ...(input.history?.length ? { conversation_history: input.history } : {}),
      ...(input.sessionId ? { session_id: input.sessionId } : {}),
    }),
    cache: "no-store",
  });

  if (!res.ok) throw new HermesError(await describe(res), res.status);
  return (await res.json()) as StartRunResult;
}

/** Opens the run's SSE stream. The caller pipes the body straight through. */
export async function runEvents(
  runId: string,
  upstream: string,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(`${BASE}/v1/runs/${encodeURIComponent(runId)}/events`, {
    headers: headers(upstream, { Accept: "text/event-stream" }),
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new HermesError(await describe(res), res.status);
  return res;
}

export type ApprovalChoice = "once" | "session" | "always" | "deny";

export async function respondToApproval(
  runId: string,
  upstream: string,
  choice: ApprovalChoice,
): Promise<void> {
  const res = await fetch(
    `${BASE}/v1/runs/${encodeURIComponent(runId)}/approval`,
    {
      method: "POST",
      headers: headers(upstream, { "Content-Type": "application/json" }),
      body: JSON.stringify({ choice }),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new HermesError(await describe(res), res.status);
}

export async function stopRun(runId: string, upstream: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/runs/${encodeURIComponent(runId)}/stop`, {
    method: "POST",
    headers: headers(upstream),
    cache: "no-store",
  });
  if (!res.ok) throw new HermesError(await describe(res), res.status);
}

/** GET /health/upstreams — used by the nav to grey out an agent that is down. */
export async function upstreamHealth(): Promise<Record<string, string>> {
  const res = await fetch(`${BASE}/health/upstreams`, {
    headers: new Headers({ Authorization: `Bearer ${clientKey()}` }),
    cache: "no-store",
  });
  if (!res.ok) return {};
  const body = (await res.json()) as {
    upstreams?: Record<string, { status?: string }>;
  };
  return Object.fromEntries(
    Object.entries(body.upstreams ?? {}).map(([k, v]) => [k, v.status ?? "unknown"]),
  );
}

export class HermesError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HermesError";
  }
}

/** Gateway errors come back OpenAI-shaped; fall back to the raw body. */
async function describe(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    /* not JSON — use the raw text */
  }
  return raw || `${res.status} ${res.statusText}`;
}
