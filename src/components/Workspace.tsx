"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useRun } from "./useRun";

interface NavItem {
  slug: string;
  label: string;
}

export default function Workspace({
  slug,
  label,
  blurb,
  starters,
  nav,
}: {
  slug: string;
  label: string;
  blurb: string;
  starters: string[];
  nav: NavItem[];
}) {
  // One stable session id per workspace per tab, so hermes scopes its
  // long-term memory to this workspace rather than mixing all three.
  const sessionId = useMemo(
    () => `business-web:${slug}:${Math.random().toString(36).slice(2, 10)}`,
    [slug],
  );

  const run = useRun(slug, sessionId);
  const [draft, setDraft] = useState("");
  const [protect, setProtect] = useState(true); // security review default
  const [health, setHealth] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((b: { agents?: { slug: string; status: string }[] }) =>
        setHealth(
          Object.fromEntries((b.agents ?? []).map((a) => [a.slug, a.status])),
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
    if (!text || busy) return;
    setDraft("");
    void run.send(text, protect);
  }

  return (
    <div className="flex h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 sm:flex">
        <div className="px-2 pb-4">
          <p className="text-sm font-semibold">영업 에이전트</p>
          <p className="mt-0.5 text-xs text-ink-soft">hermes-agent 백엔드</p>
        </div>
        <nav className="flex flex-col gap-0.5">
          {nav.map((item) => {
            const active = item.slug === slug;
            const status = health[item.slug];
            return (
              <Link
                key={item.slug}
                href={`/w/${item.slug}`}
                className={`flex items-center justify-between rounded-md px-2.5 py-2 text-sm ${
                  active
                    ? "bg-accent/10 font-medium text-accent"
                    : "text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                <span>{item.label}</span>
                <span
                  aria-label={status === "ok" ? "정상" : "확인 필요"}
                  className={`size-1.5 rounded-full ${
                    status === "ok"
                      ? "bg-emerald-500"
                      : status
                        ? "bg-amber-500"
                        : "bg-line"
                  }`}
                />
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2 pt-4">
          <button
            onClick={run.reset}
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-soft hover:bg-canvas"
          >
            새 대화
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-baseline gap-3 border-b border-line bg-surface px-6 py-3.5">
          <h1 className="text-base font-semibold">{label}</h1>
          <p className="truncate text-xs text-ink-soft">{blurb}</p>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {run.turns.length === 0 && !busy && (
              <div className="pt-8">
                <p className="text-sm text-ink-soft">이렇게 시작해 보세요</p>
                <div className="mt-3 flex flex-col gap-2">
                  {starters.map((s) => (
                    <button
                      key={s}
                      onClick={() => void run.send(s, protect)}
                      className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-left text-sm hover:border-accent hover:text-accent"
                    >
                      {s}
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
            {Object.keys(run.redacted).length > 0 && (
              <p className="mb-1.5 text-xs text-warn">
                전송 전 마스킹: {describeRedaction(run.redacted)}
              </p>
            )}
            <div className="flex items-end gap-2">
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
                  disabled={!draft.trim()}
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
              고객정보 보호 — 이메일·전화·주민번호·사업자번호를 전송 전에 마스킹
            </label>
          </div>
        </footer>
      </main>
    </div>
  );
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
  };
  return Object.entries(hits)
    .map(([k, n]) => `${names[k] ?? k} ${n}건`)
    .join(", ");
}
