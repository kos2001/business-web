/**
 * Adapter for the mi-report backend (`~/gitspace/mi-report`, FastAPI on :8000).
 *
 * MI reporting is already a finished application over there: corpus ingestion
 * (Confluence, SEC EDGAR, DART, 한경, news URLs), hybrid BM25 + embedding
 * retrieval, digest/topic/competitor generation, an LLM wiki, and its own
 * Next.js UI. Its `/agent/chat` is a hermes agent *with that corpus wired in*.
 * Pointing this workspace at the bare `mi-report` hermes profile instead would
 * hand the sales team an agent that cannot see any of it.
 *
 * So the MI workspace proxies there. The wrinkle is protocol: mi-report streams
 * `{"type": "progress"|"delta"|"done"|"error"}` while hermes streams
 * `{"event": "tool.started"|"message.delta"|"run.completed"|…}`. Rather than
 * teach the browser two vocabularies, this module translates mi-report's stream
 * into hermes-shaped frames. `useRun` and `run-events.ts` stay untouched.
 */

import { lookupMiSession, rememberMiSession } from "./mi-sessions";

const BASE = process.env.MI_REPORT_URL ?? "http://127.0.0.1:8000";

/**
 * mi-report scopes sessions and long-term memory per user id, and validates it
 * as `^[A-Za-z0-9_-]{1,64}$`. business-web has no login yet, so every request
 * goes in under one configurable identity — replace this the moment auth lands,
 * or sales reps will share a memory scope.
 */
const USER_ID = (process.env.MI_REPORT_USER_ID ?? "business-web").replace(
  /[^A-Za-z0-9_-]/g,
  "-",
);

export interface MiChatInput {
  message: string;
  /**
   * This app's workspace session id — NOT mi-report's. It is used only to look
   * up the mi-report session minted on an earlier turn; see mi-sessions.ts for
   * why sending it straight through returns 404.
   */
  sessionId?: string;
}

/** True when the mi-report backend answers its health check. */
export async function miHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Opens the chat stream and re-emits it as hermes run events.
 *
 * `runId` is synthesised by the caller — mi-report has no run concept, but the
 * browser's state machine is keyed on one, and carrying it through keeps the
 * two backends interchangeable from the UI's point of view.
 */
export async function miChatAsRunEvents(
  runId: string,
  input: MiChatInput,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const miSessionId = lookupMiSession(input.sessionId);

  const upstream = await fetch(`${BASE}/agent/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: input.message,
      userId: USER_ID,
      // Omitted on the first turn so mi-report mints one; echoed back after.
      ...(miSessionId ? { sessionId: miSessionId } : {}),
    }),
    cache: "no-store",
    signal,
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(
      `mi-report 백엔드 오류 (${upstream.status}): ${detail.slice(0, 200)}`,
    );
  }

  return translate(upstream.body, runId, input.sessionId);
}

/** mi-report frame → hermes frame. Exported for the unit tests. */
export function translateEvent(
  raw: Record<string, unknown>,
  runId: string,
): Record<string, unknown> | null {
  const timestamp = Date.now() / 1000;

  switch (raw.type) {
    case "progress": {
      // mi-report forwards hermes's own `hermes.tool.progress` payload verbatim:
      // { tool, emoji, label, toolCallId, status }. There are two frames per
      // tool — running then completed — so mapping them both to tool.started
      // (as an earlier version did) double-counted every call and rendered the
      // completion as a nameless "진행" row.
      const tool = typeof raw.tool === "string" && raw.tool ? raw.tool : undefined;
      const label = typeof raw.label === "string" ? raw.label : undefined;
      if (raw.status === "completed" || raw.status === "done") {
        return tool
          ? { event: "tool.completed", run_id: runId, timestamp, tool }
          : null;
      }
      if (!tool) return null; // a frame naming no tool has nothing to show
      return {
        event: "tool.started",
        run_id: runId,
        timestamp,
        tool,
        // `label` is hermes's human preview of the arguments; it repeats the
        // tool name when there is nothing more specific to say.
        preview: label && label !== tool ? label : undefined,
      };
    }
    case "delta":
      return {
        event: "message.delta",
        run_id: runId,
        timestamp,
        delta: String(raw.text ?? raw.delta ?? ""),
      };
    case "done": {
      // mi-report grounds its answers and reports which corpus documents it
      // used. Dropping that would turn a cited answer into an assertion, which
      // is the whole difference between this and a plain chatbot.
      const answer = typeof raw.answer === "string" ? raw.answer : "";
      return {
        event: "run.completed",
        run_id: runId,
        timestamp,
        output: answer + formatSources(raw.sources) + formatUngrounded(raw),
      };
    }
    case "error":
      return {
        event: "run.failed",
        run_id: runId,
        timestamp,
        error: String(raw.detail ?? "mi-report 백엔드가 오류를 반환했습니다."),
      };
    default:
      return null; // unknown frame — drop rather than confuse the UI
  }
}

interface MiSource {
  id?: string;
  title?: string;
  source?: string;
  publishedAt?: string;
}

/** Renders the cited documents as a markdown list appended to the answer. */
export function formatSources(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length === 0) return "";
  const lines = (raw as MiSource[])
    .filter((s) => s && (s.title || s.id))
    .map((s) => {
      const parts = [s.title ?? s.id];
      if (s.source) parts.push(s.source);
      if (s.publishedAt) parts.push(s.publishedAt);
      return `- ${parts.join(" · ")}`;
    });
  return lines.length ? `\n\n---\n\n**출처**\n${lines.join("\n")}` : "";
}

/**
 * mi-report checks whether the numbers in its answer trace back to a document.
 * A false `numbersGrounded` means it wrote a figure it could not source — the
 * single most dangerous failure mode in a sales report, so it is surfaced
 * rather than buried in the payload.
 */
export function formatUngrounded(raw: Record<string, unknown>): string {
  if (raw.numbersGrounded !== false) return "";
  const nums = Array.isArray(raw.ungroundedNumbers) ? raw.ungroundedNumbers : [];
  const detail = nums.length ? ` (${nums.join(", ")})` : "";
  return `\n\n> ⚠️ 근거 문서에서 확인되지 않는 수치가 포함되어 있습니다${detail}. 인용 전 확인하세요.`;
}

function translate(
  body: ReadableStream<Uint8Array>,
  runId: string,
  clientSessionId?: string,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let sawTerminal = false;

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);

            const payload = frame
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim())
              .join("\n");
            if (!payload) continue;

            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(payload) as Record<string, unknown>;
            } catch {
              continue;
            }

            // The done frame carries mi-report's session id; remembering it is
            // what makes the next turn a continuation rather than a new chat.
            if (parsed.type === "done" && typeof parsed.sessionId === "string") {
              if (clientSessionId) rememberMiSession(clientSessionId, parsed.sessionId);
            }

            const out = translateEvent(parsed, runId);
            if (!out) continue;
            if (out.event === "run.completed" || out.event === "run.failed") {
              sawTerminal = true;
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              event: "run.failed",
              run_id: runId,
              timestamp: Date.now() / 1000,
              error: err instanceof Error ? err.message : "스트림이 끊겼습니다.",
            })}\n\n`,
          ),
        );
        sawTerminal = true;
      } finally {
        // The UI leaves the composer disabled until a terminal event arrives, so
        // a stream that ends without one would hang the workspace.
        if (!sawTerminal) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                event: "run.completed",
                run_id: runId,
                timestamp: Date.now() / 1000,
              })}\n\n`,
            ),
          );
        }
        controller.close();
      }
    },
  });
}
