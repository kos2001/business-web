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

/**
 * Runs a prompt and waits for the answer, polling rather than streaming.
 *
 * The chat path streams because a person is watching tokens appear. Machine
 * callers — the answer review in `answer-review.ts` — want one string and have
 * no use for the intermediate events, and reassembling `message.delta` frames
 * just to throw the stream away is more code with more to go wrong.
 *
 * Bounded by `timeoutMs` and returns null on timeout rather than throwing: the
 * callers are checks on someone else's answer, and a check that fails must not
 * take the answer down with it.
 */
export async function runBlocking(
  input: StartRunInput,
  timeoutMs = 120_000,
): Promise<string | null> {
  const started = await startRun(input);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2_000));
    const res = await fetch(`${BASE}/v1/runs/${encodeURIComponent(started.run_id)}`, {
      headers: headers(input.upstream),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { status?: string; output?: string };
    if (body.status === "completed") return body.output ?? "";
    if (body.status === "failed") return null;
  }
  return null;
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

/**
 * The skill names an upstream can actually see.
 *
 * Workspaces point at playbooks by name (`src/lib/playbooks.ts`), and a name
 * that no longer resolves fails silently: the agent cannot find the skill and
 * answers from its persona instead, which reads as the model having an off day
 * rather than as a broken install. This happened for real — 33 of 40 playbooks
 * were missing from the profile while every workspace still reported healthy,
 * because health only proved the upstream was reachable.
 *
 * Asking the agent what it can see is the right source of truth: it is the
 * agent's own view, and it does not assume the profile lives on this machine
 * the way reading `~/.hermes` would.
 */
export async function listSkills(upstream: string): Promise<Set<string>> {
  const res = await fetch(`${BASE}/v1/skills`, {
    headers: headers(upstream),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new HermesError(await describe(res), res.status);

  const body = (await res.json()) as { data?: { name?: string }[] };
  return new Set(
    (body.data ?? [])
      .map((s) => s.name)
      .filter((n): n is string => typeof n === "string"),
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
