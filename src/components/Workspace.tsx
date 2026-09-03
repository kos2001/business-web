"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useRun, type Attachment } from "./useRun";
import Sidebar, { type HealthMap, type NavItem } from "./Sidebar";
import StageIcon from "./StageIcon";
import { STAGE_META } from "@/lib/stage-meta";
import type { Stage } from "@/lib/agents";

export default function Workspace({
  slug,
  label,
  blurb,
  stage,
  starters,
  actions,
  nav,
}: {
  slug: string;
  label: string;
  blurb: string;
  stage: Stage;
  starters: string[];
  actions?: { id: "report"; label: string; hint: string }[];
  nav: NavItem[];
}) {
  // One session id per workspace per conversation. It scopes hermes's long-term
  // memory and keys the server-side mi-report session mapping, so starting a new
  // conversation has to mint a new one — clearing the transcript alone would
  // leave the backend continuing the previous thread.
  const [sessionId, setSessionId] = useState(() => newSessionId(slug));
  useEffect(() => setSessionId(newSessionId(slug)), [slug]);

  const run = useRun(slug, sessionId);

  // What the user typed on the home board, carried here as the opening draft so
  // nothing has to be retyped. Left in the box rather than sent: they may have
  // been describing the job to find the workspace, not writing the request.
  const search = useSearchParams();
  const [draft, setDraft] = useState(() => search.get("q") ?? "");

  // Home pins the workspaces you actually use to the top; this is what tells it
  // which those are.
  useEffect(() => {
    try {
      const key = "business-web:recents";
      const prev = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
      const next = [slug, ...prev.filter((s) => s !== slug)].slice(0, 8);
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* a workspace that cannot be remembered still opens */
    }
  }, [slug]);

  const [protect, setProtect] = useState(true); // security review default
  const [health, setHealth] = useState<HealthMap>({});
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then(
        (b: {
          agents?: {
            slug: string;
            status: string;
            missingPlaybooks?: string[];
          }[];
        }) =>
          setHealth(
            Object.fromEntries(
              (b.agents ?? []).map((a) => [
                a.slug,
                // A workspace whose backend answers but whose playbooks are not
                // installed is not healthy — the agent quietly answers from its
                // persona instead. Folding that into one status keeps the nav
                // honest without adding a second indicator to every row.
                a.status === "ok" && a.missingPlaybooks?.length
                  ? { state: "degraded" as const, missing: a.missingPlaybooks }
                  : { state: a.status },
              ]),
            ),
          ),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [run.turns, run.streaming, run.tools, run.approval]);

  const busy = run.state !== "idle";

  function submit() {
    const text = draft.trim();
    if ((!text && files.length === 0) || busy) return;
    setDraft("");
    setFiles([]);
    void run.send(text || "첨부한 파일을 분석해 줘.", protect, files);
  }

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const form = new FormData();
        form.append("file", file);
        form.append("sessionId", sessionId);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const body = (await res.json()) as Attachment & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `${file.name} 업로드 실패`);
        setFiles((prev) => [...prev, body]);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex h-dvh">
      <Sidebar
        nav={nav}
        slug={slug}
        stage={stage}
        health={health}
        onReset={() => {
          run.reset();
          setFiles([]);
          setUploadError(null);
          setSessionId(newSessionId(slug));
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-6 py-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              color: STAGE_META[stage].color,
              backgroundColor: `color-mix(in srgb, ${STAGE_META[stage].color} 12%, transparent)`,
            }}
          >
            <StageIcon stage={stage} className="size-4" />
          </span>
          <div className="min-w-0">
            {/* On mobile the sidebar is hidden, so this is the only way back. */}
            <Link
              href="/"
              className="text-[11px] text-ink-soft hover:text-accent sm:pointer-events-none"
            >
              {stage}
            </Link>
            <h1 className="truncate text-base font-semibold leading-tight">
              {label}
            </h1>
          </div>
          <p className="hidden min-w-0 flex-1 truncate text-xs text-ink-soft lg:block">
            {blurb}
          </p>
        </header>

        <div
          className={`relative flex-1 overflow-y-auto px-6 py-5 ${
            dragging ? "bg-accent/5" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void upload(e.dataTransfer.files);
          }}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-4 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-canvas/80 text-sm text-accent">
              여기에 파일을 놓으세요
            </div>
          )}
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {run.turns.length === 0 && !busy && actions && actions.length > 0 && (
              <div className="pt-8">
                {actions.map((a) => (
                  <button
                    key={a.id}
                    onClick={() =>
                      void run.send(a.label, protect, [], a.id)
                    }
                    className="w-full rounded-lg border border-accent/40 bg-accent/5 px-3.5 py-3 text-left hover:bg-accent/10"
                  >
                    <span className="text-sm font-medium text-accent">{a.label}</span>
                    <span className="mt-0.5 block text-xs text-ink-soft">{a.hint}</span>
                  </button>
                ))}
              </div>
            )}

            {run.turns.length === 0 && !busy && (
              <div className="pt-6">
                {/* What this workspace is, before what to type in it. Someone
                    who arrived by clicking around needs the first sentence
                    more than they need the examples. */}
                <p className="text-sm leading-relaxed">{blurb}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                  아래 예시를 눌러 바로 시작하거나, 가진 자료를 붙여넣고 평소
                  쓰는 말로 요청하세요. 파일은 아래 &lsquo;첨부&rsquo; 버튼이나
                  화면에 끌어다 놓으면 됩니다.
                </p>

                <p className="mt-6 text-xs font-medium text-ink-soft">
                  이렇게 시작해 보세요
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {starters.map((s) => (
                    <button
                      key={s}
                      onClick={() => void run.send(s, protect)}
                      className="group flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-left text-sm hover:border-accent"
                      style={{ borderLeftColor: STAGE_META[stage].color, borderLeftWidth: 2.5 }}
                    >
                      <span className="flex-1 group-hover:text-accent">{s}</span>
                      <span
                        aria-hidden
                        className="shrink-0 text-xs text-ink-soft/50 group-hover:text-accent"
                      >
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {run.turns.map((turn, i) =>
              turn.role === "user" ? (
                <div key={i} className="self-end max-w-[85%]">
                  <div className="rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm text-white whitespace-pre-wrap">
                    {turn.text}
                  </div>
                  {turn.files && turn.files.length > 0 && (
                    <p className="mt-1 text-right text-xs text-ink-soft">
                      첨부 {turn.files.join(", ")}
                    </p>
                  )}
                </div>
              ) : (
                <article key={i} className="prose-agent max-w-none text-sm">
                  <ReactMarkdown>{turn.text}</ReactMarkdown>
                </article>
              ),
            )}

            {run.tools.length > 0 && busy && (
              <ul className="flex flex-col gap-1 border-l-2 border-line pl-3">
                {run.tools.map((t, i) => (
                  <li key={i} className="text-xs text-ink-soft">
                    <span className={t.done ? "" : "animate-pulse"}>
                      {t.done ? "✓" : "▸"} {t.tool}
                    </span>
                    {t.preview && (
                      <span className="ml-1.5 opacity-70">{t.preview}</span>
                    )}
                    {t.duration !== undefined && (
                      <span className="ml-1.5 opacity-60">{t.duration}s</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {run.streaming && (
              <article className="prose-agent max-w-none text-sm">
                <ReactMarkdown>{run.streaming}</ReactMarkdown>
              </article>
            )}

            {run.approval && (
              <div className="rounded-lg border border-warn/40 bg-warn/5 p-3.5">
                <p className="text-sm font-medium text-warn">
                  에이전트가 승인을 요청했습니다
                </p>
                <pre className="mt-2 max-h-40 overflow-auto rounded border border-line bg-surface p-2 text-xs">
                  {JSON.stringify(run.approval.detail, null, 2)}
                </pre>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {run.approval.choices.map((c) => (
                    <button
                      key={c}
                      onClick={() => void run.answerApproval(c)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        c === "deny"
                          ? "border border-line text-ink-soft hover:bg-canvas"
                          : "bg-warn text-white hover:opacity-90"
                      }`}
                    >
                      {approvalLabel(c)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {run.error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {run.error}
              </p>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        <footer className="border-t border-line bg-surface px-6 py-3">
          <div className="mx-auto max-w-3xl">
            {files.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-1.5">
                {files.map((f) => (
                  <li
                    key={f.path}
                    className="flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-1 text-xs"
                  >
                    <span className="max-w-56 truncate">{f.name}</span>
                    <span className="text-ink-soft">{formatBytes(f.bytes)}</span>
                    <button
                      onClick={() =>
                        setFiles((prev) => prev.filter((x) => x.path !== f.path))
                      }
                      aria-label={`${f.name} 첨부 제거`}
                      className="text-ink-soft hover:text-ink"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {uploadError && (
              <p className="mb-1.5 text-xs text-red-700">{uploadError}</p>
            )}

            {Object.keys(run.redacted).length > 0 && (
              <p className="mb-1.5 text-xs text-warn">
                전송 전 마스킹: {describeRedaction(run.redacted)}
              </p>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => void upload(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || uploading}
                title="파일 첨부"
                aria-label="파일 첨부"
                className="h-11 rounded-lg border border-line px-3 text-sm text-ink-soft hover:bg-canvas disabled:opacity-40"
              >
                {uploading ? "…" : "첨부"}
              </button>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={2}
                placeholder={busy ? "실행 중…" : "요청을 입력하세요 (Shift+Enter 줄바꿈)"}
                disabled={busy}
                className="min-h-11 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
              />
              {busy ? (
                <button
                  onClick={() => void run.stop()}
                  className="rounded-lg border border-line px-3.5 py-2 text-sm text-ink-soft hover:bg-canvas"
                >
                  중단
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!draft.trim() && files.length === 0}
                  className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  보내기
                </button>
              )}
            </div>
            <label className="mt-2 flex items-center gap-1.5 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={protect}
                onChange={(e) => setProtect(e.target.checked)}
              />
              고객정보 보호 — 이메일·전화·주민번호·사업자번호·카드·API 키·IP를 전송 전에 마스킹
            </label>
          </div>
        </footer>
      </main>
    </div>
  );
}

function newSessionId(slug: string): string {
  return `business-web:${slug}:${Math.random().toString(36).slice(2, 10)}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function approvalLabel(choice: string): string {
  const map: Record<string, string> = {
    once: "이번만 허용",
    session: "이 세션 동안 허용",
    always: "항상 허용",
    deny: "거부",
  };
  return map[choice] ?? choice;
}

function describeRedaction(hits: Record<string, number>): string {
  const names: Record<string, string> = {
    email: "이메일",
    phone: "전화번호",
    rrn: "주민번호",
    bizno: "사업자번호",
    card: "카드번호",
    secret: "API 키",
    ip: "IP 주소",
  };
  return Object.entries(hits)
    .map(([k, n]) => `${names[k] ?? k} ${n}건`)
    .join(", ");
}
