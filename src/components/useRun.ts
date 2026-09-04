"use client";

import { useCallback, useRef, useState } from "react";
import { createSseParser, type RunEvent } from "@/lib/run-events";

export interface Turn {
  role: "user" | "agent";
  text: string;
  /** Names of files attached to this turn, for the transcript. */
  files?: string[];
}

export interface ToolTrace {
  tool: string;
  preview?: string;
  duration?: number;
  done: boolean;
}

export interface PendingApproval {
  runId: string;
  choices: string[];
  detail: Record<string, unknown>;
}

export interface Attachment {
  path: string;
  name: string;
  bytes: number;
  /** True when `path` is parsed Markdown rather than the raw upload. */
  parsed?: boolean;
  /** Extra files worth naming in the prompt (extracted tables). */
  extraPaths?: string[];
  /** Why parsing was skipped or failed. */
  note?: string;
}

export type RunState = "idle" | "running" | "waiting_for_approval";

/**
 * Owns one workspace's conversation and its live run.
 *
 * Deliberately thin: hermes decides what tools to call, when to ask for
 * approval, and when the run is done. This hook translates that stream into
 * render state and sends the user's answers back. There is no plan, no router,
 * no graph on this side — adding one would mean two systems disagreeing about
 * whose turn it is.
 */
export function useRun(agent: string, sessionId: string) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState("");
  const [tools, setTools] = useState<ToolTrace[]>([]);
  // Kept after the run so the finished answer can still show what it was based
  // on. Previously the trace was cleared and the evidence went with it.
  const [startedAt, setStartedAt] = useState<number | undefined>(undefined);
  const [state, setState] = useState<RunState>("idle");
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redacted, setRedacted] = useState<Record<string, number>>({});

  const runIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamedRef = useRef("");
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;

  const finish = useCallback((finalText: string) => {
    setTurns((prev) => [...prev, { role: "agent", text: finalText }]);
    setStreaming("");
    streamedRef.current = "";
    setState("idle");
    setApproval(null);
    runIdRef.current = null;
  }, []);

  const consume = useCallback(
    async (runId: string) => {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch(
        `/api/runs/${encodeURIComponent(runId)}/events?agent=${encodeURIComponent(agent)}`,
        { signal: controller.signal },
      );
      if (!res.ok || !res.body) {
        throw new Error((await res.text()) || "이벤트 스트림을 열지 못했습니다.");
      }

      const push = createSseParser((e: RunEvent) => {
        switch (e.event) {
          case "message.delta":
            streamedRef.current += e.delta;
            setStreaming(streamedRef.current);
            break;
          case "tool.started":
            setTools((prev) => [
              ...prev,
              { tool: e.tool, preview: e.preview, done: false },
            ]);
            break;
          case "tool.completed":
            setTools((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i -= 1) {
                if (next[i].tool === e.tool && !next[i].done) {
                  next[i] = { ...next[i], done: true, duration: e.duration };
                  break;
                }
              }
              return next;
            });
            break;
          case "approval.request": {
            const { event: _e, run_id, timestamp: _t, choices, ...detail } = e;
            void _e;
            void _t;
            setState("waiting_for_approval");
            setApproval({ runId: run_id, choices, detail });
            break;
          }
          case "approval.responded":
            setApproval(null);
            setState("running");
            break;
          case "run.completed":
            finish(e.output ?? streamedRef.current);
            break;
          case "run.failed":
            setError(e.error ?? "실행이 실패했습니다.");
            finish(streamedRef.current);
            break;
          case "run.cancelled":
            finish(streamedRef.current || "(중단됨)");
            break;
        }
      });

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) push(value);
      }
    },
    [agent, finish],
  );

  const send = useCallback(
    async (
      input: string,
      protect: boolean,
      files: Attachment[] = [],
      action?: "report",
    ) => {
      if (state !== "idle" || (!input.trim() && files.length === 0 && !action)) return;
      setError(null);
      setTools([]);
      setRedacted({});
      setStartedAt(Date.now());
      setTurns((prev) => [
        ...prev,
        { role: "user", text: input, files: files.map((f) => f.name) },
      ]);
      setState("running");

      // hermes rejects file content parts, but the agent reads paths off disk
      // with read_file. Naming the staged paths is the whole upload mechanism.
      // Appended after the user's words so the instruction stays the lead.
      // Naming the parsed path and the tables separately matters: a review
      // that never opens the table file is exactly how the numbers it is
      // supposed to check go unchecked.
      const prompt = files.length
        ? `${input}\n\n첨부 파일 (경로로 직접 읽을 것):\n${files
            .flatMap((f) => [
              `- ${f.path}${f.parsed ? `  (${f.name} 을 변환한 텍스트)` : ""}`,
              ...(f.extraPaths ?? []).map((p) => `- ${p}  (${f.name} 의 표)`),
            ])
            .join("\n")}`
        : input;

      try {
        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent,
            input: prompt,
            protect,
            ...(action ? { action } : {}),
            sessionId,
            history: turnsRef.current.map((t) => ({
              role: t.role === "agent" ? "assistant" : "user",
              content: t.text,
            })),
          }),
        });

        const body = (await res.json()) as {
          run_id?: string;
          error?: string;
          redacted?: Record<string, number>;
        };
        if (!res.ok || !body.run_id) {
          throw new Error(body.error ?? "실행을 시작하지 못했습니다.");
        }

        setRedacted(body.redacted ?? {});
        runIdRef.current = body.run_id;
        await consume(body.run_id);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
        setStreaming("");
        streamedRef.current = "";
        setState("idle");
      }
    },
    [agent, consume, sessionId, state],
  );

  const answerApproval = useCallback(
    async (choice: string) => {
      const runId = approval?.runId;
      if (!runId) return;
      setApproval(null);
      setState("running");
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, choice }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "승인 응답을 보내지 못했습니다.");
      }
    },
    [agent, approval],
  );

  const stop = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    await fetch(
      `/api/runs/${encodeURIComponent(runId)}/stop?agent=${encodeURIComponent(agent)}`,
      { method: "POST" },
    ).catch(() => undefined);
    abortRef.current?.abort();
    finish(streamedRef.current || "(중단됨)");
  }, [agent, finish]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    runIdRef.current = null;
    streamedRef.current = "";
    setTurns([]);
    setStreaming("");
    setTools([]);
    setStartedAt(undefined);
    setApproval(null);
    setError(null);
    setRedacted({});
    setState("idle");
  }, []);

  return {
    turns,
    streaming,
    tools,
    startedAt,
    state,
    approval,
    error,
    redacted,
    send,
    answerApproval,
    stop,
    reset,
  };
}
