"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useRun, type Attachment } from "./useRun";
import Sidebar, { type HealthMap, type NavItem } from "./Sidebar";
import StageIcon from "./StageIcon";
import ActivityTrace from "./ActivityTrace";
import CorpusPanel from "./CorpusPanel";
import ActionCapture from "./ActionCapture";
import AnswerCheck from "./AnswerCheck";
import { STAGE_META } from "@/lib/stage-meta";
import { recordVisit } from "@/lib/recents";
import type { Stage } from "@/lib/agents";

export default function Workspace({
  slug,
  label,
  blurb,
  stage,
  starters,
  actions,
  corpus,
  agent,
  nav,
}: {
  slug: string;
  label: string;
  blurb: string;
  stage: Stage;
  starters: string[];
  actions?: { id: "report"; label: string; hint: string }[];
  /** Contract workspaces can file an upload as precedent. */
  corpus?: boolean;
  /** Named on the trace so the answer is attributable. */
  agent: { name: string; model: string };
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

  const [protect, setProtect] = useState(true); // security review default
  const [health, setHealth] = useState<HealthMap>({});
  const [recents, setRecents] = useState<string[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  /**
   * Whether to call it 계약서 or 문서 on the button.
   *
   * The upload used to sit above the examples on 계약 and below them elsewhere,
   * on the theory that a domain whose work does not start with a file should
   * not lead with one. In use that reasoning loses to a simpler one: a control
   * that moves depending on which page you are on has to be found again every
   * time, and the whole point of replacing the paperclip was that people could
   * not find it. One position everywhere; only the wording follows the domain.
   */
  const docFirst = stage === "계약";

  const [uploading, setUploading] = useState(false);
  /** Whether this deployment has Confluence credentials, asked once on mount. */
  const [wikiOn, setWikiOn] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiUrl, setWikiUrl] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [filing, setFiling] = useState<string | null>(null);
  const [corpusVersion, setCorpusVersion] = useState(0);
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

  // Home pins the workspaces you actually use to the top, and the nav shows the
  // same list; this is what tells both which those are.
  useEffect(() => setRecents(recordVisit(slug)), [slug]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [run.turns, run.streaming, run.tools, run.approval]);

  // Asked rather than assumed: offering a control that always errors is worse
  // than not offering it, and the credentials that decide this are server-side.
  useEffect(() => {
    fetch("/api/confluence")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setWikiOn(Boolean(d.configured)))
      .catch(() => setWikiOn(false));
  }, []);

  const busy = run.state !== "idle";
  const isEmpty = run.turns.length === 0 && !busy;
  /** Index of the newest user turn — where this run's trace belongs. */
  const lastUserTurn = run.turns.reduce(
    (acc, t, i) => (t.role === "user" ? i : acc),
    -1,
  );

  /**
   * Asks the question again, naming what was wrong with the last answer.
   *
   * The faults go into the prompt rather than being fixed in place. A plain
   * re-run is a second roll of the same dice; telling the model that it wrote
   * 무상한 배상 and 반도체 부종 gives it something specific to avoid. The
   * original question leads, because the task has not changed — only the
   * warning has been added.
   */
  function retryWithFaults(question: string, faults: string[]) {
    if (busy) return;
    const listed = faults.slice(0, 8).map((f) => `- ${f}`).join("\n");
    void run.send(
      `${question}\n\n앞서 같은 요청에 대한 답변에서 아래 문제가 발견되었습니다. ` +
        `같은 실수를 반복하지 말고 처음부터 다시 작성해 주세요. 특히 맞춤법과 ` +
        `수치 표기를 출력 전에 스스로 점검하세요.\n${listed}`,
      protect,
    );
  }

  function submit() {
    const text = draft.trim();
    if ((!text && files.length === 0) || busy) return;
    setDraft("");
    setFiles([]);
    void run.send(text || "첨부한 파일을 분석해 줘.", protect, files);
  }

  /**
   * Files an already-uploaded contract into the corpus as precedent.
   *
   * Deliberate rather than automatic: every draft a rep opens should not
   * silently become "what we agreed", or the corpus stops meaning anything.
   */
  async function fileAsPrecedent(f: Attachment) {
    setFiling(f.path);
    try {
      const res = await fetch("/api/corpus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ingest", path: f.path, name: f.name }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      setUploadError(body.error ?? body.message ?? null);
      if (res.ok) setCorpusVersion((v) => v + 1);
    } catch {
      setUploadError("코퍼스 추가에 실패했습니다.");
    } finally {
      setFiling(null);
    }
  }

  /**
   * Pulls a Confluence page in and attaches it like a file.
   *
   * Shares `files` and `uploadError` with the upload path rather than having
   * its own: once a page is attached it is a document, and giving it a separate
   * list and a separate error line would mean two of everything for a
   * distinction the user stops caring about the moment it is on screen.
   */
  async function addWikiPage() {
    const url = wikiUrl.trim();
    if (!url || uploading) return;
    setUploadError(null);
    setUploading(true);
    try {
      const res = await fetch("/api/confluence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, sessionId }),
      });
      const body = (await res.json()) as Attachment & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "페이지를 가져오지 못했습니다.");
      setFiles((prev) => [...prev, body]);
      setWikiUrl("");
      setWikiOpen(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "페이지를 가져오지 못했습니다.");
    } finally {
      setUploading(false);
    }
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

  /*
   * Uploading used to be a sentence pointing at an unlabelled paperclip in the
   * composer — "아래 클립 아이콘을 누르거나". People asked where the upload menu
   * was, which is the right question: a hint that names a control is not a
   * control, and an icon with no word beside it is not found by anyone who does
   * not already know it is there.
   *
   * It leads the empty state on the 계약 workspaces because there the work
   * *starts* with a file — a contract review with no contract has nothing to
   * review, so the first thing on screen should be the way to hand one over.
   */
  /**
   * The wiki equivalent of the upload button.
   *
   * Sits with it rather than in a menu: "the contract is a page, not a file" is
   * not an advanced case, it is half the contracts, and a document source
   * hidden behind an overflow is a document source nobody finds — the same
   * mistake the paperclip made.
   */
  const wikiCta = wikiOn ? (
    <div className="mt-2">
      {wikiOpen ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={wikiUrl}
            onChange={(e) => setWikiUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addWikiPage();
              if (e.key === "Escape") setWikiOpen(false);
            }}
            autoFocus
            placeholder="Confluence 페이지 주소를 붙여넣으세요"
            aria-label="Confluence 페이지 주소"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
          />
          <button
            onClick={() => void addWikiPage()}
            disabled={!wikiUrl.trim() || uploading}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {uploading ? "가져오는 중…" : "가져오기"}
          </button>
          <button
            onClick={() => setWikiOpen(false)}
            className="px-1.5 py-2 text-xs text-ink-soft hover:text-ink"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          onClick={() => setWikiOpen(true)}
          className="flex items-center gap-2 text-xs text-ink-soft transition-colors hover:text-accent"
        >
          <svg viewBox="0 0 16 16" fill="none" className="size-3.5" aria-hidden>
            <path
              d="M6.5 9.5a3 3 0 0 0 4.24 0l2-2a3 3 0 0 0-4.24-4.24l-.7.7M9.5 6.5a3 3 0 0 0-4.24 0l-2 2a3 3 0 0 0 4.24 4.24l.7-.7"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          계약서가 Confluence 페이지에 있나요? 주소로 가져오기
        </button>
      )}
    </div>
  ) : (
    // Not configured. A quiet pointer rather than nothing at all: the feature
    // exists, this deployment has not been given credentials, and the person
    // reading this is the one who can fix that.
    <p className="mt-2 text-[11px] text-ink-soft">
      계약서가 Confluence 에 있다면{" "}
      <a href="/settings/confluence" className="text-accent hover:underline">
        연결을 설정
      </a>
      하면 주소로 가져올 수 있습니다.
    </p>
  );

  const uploadCta = (
    <button
      onClick={() => fileInputRef.current?.click()}
      disabled={uploading}
      className="group mt-4 flex w-full items-center gap-3 rounded-xl border border-dashed bg-surface px-4 py-3.5 text-left transition-colors hover:bg-canvas disabled:opacity-60"
      style={{ borderColor: `color-mix(in srgb, ${STAGE_META[stage].color} 45%, transparent)` }}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          color: STAGE_META[stage].color,
          backgroundColor: `color-mix(in srgb, ${STAGE_META[stage].color} 12%, transparent)`,
        }}
      >
        {uploading ? (
          <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
        ) : (
          <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
            <path
              d="M10 13.5V4m0 0L6.5 7.5M10 4l3.5 3.5M3.5 13v2A1.5 1.5 0 0 0 5 16.5h10a1.5 1.5 0 0 0 1.5-1.5v-2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          {uploading ? "올리는 중…" : docFirst ? "계약서 올리기" : "문서 올리기"}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
          끌어다 놓아도 됩니다. PDF·워드·한글·엑셀·이미지, 한 개당 25MB까지.
        </span>
      </span>
    </button>
  );

  return (
    <div className="flex h-dvh">
      <Sidebar
        nav={nav}
        slug={slug}
        stage={stage}
        health={health}
        recents={recents}
        onReset={() => {
          run.reset();
          setFiles([]);
          setUploadError(null);
          setSessionId(newSessionId(slug));
        }}
      />

      <main key={slug} className="page-enter flex min-w-0 flex-1 flex-col">
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
            {/* A breadcrumb, not a label. Without a visible way back, arriving
                here reads as a tab that changed rather than a page you opened —
                and the previous version actively removed the way back by
                disabling this link above `sm`. */}
            <nav
              aria-label="위치"
              className="flex items-center gap-1 text-[11px] text-ink-soft"
            >
              <Link href="/" className="hover:text-accent hover:underline">
                전체 업무
              </Link>
              <span aria-hidden className="opacity-40">
                /
              </span>
              <Link
                href={`/?stage=${encodeURIComponent(stage)}`}
                className="truncate hover:underline"
                style={{ color: STAGE_META[stage].color }}
              >
                {stage}
              </Link>
            </nav>
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
          <div
            className={`mx-auto flex max-w-3xl flex-col gap-4 ${
              // An empty workspace is mostly blank space, and content pinned to
              // the top of it reads as a page that failed to load. Centring the
              // prompt turns the emptiness into deliberate framing.
              isEmpty ? "min-h-full justify-center" : ""
            }`}
          >
            {isEmpty && actions && actions.length > 0 && (
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

            {isEmpty && (
              <div className="py-6">
                {/* An anchor for the block. Centred text with no mass reads as
                    content that failed to load; the tile and the name give the
                    empty state a subject, and repeat the domain colour the user
                    just clicked in the nav. */}
                {/* Hidden on narrow screens: the page header already shows
                    this exact pair there, and the block exists to give the
                    centred column mass on a wide one. */}
                <div className="hidden items-center gap-2.5 sm:flex">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      color: STAGE_META[stage].color,
                      backgroundColor: `color-mix(in srgb, ${STAGE_META[stage].color} 12%, transparent)`,
                    }}
                  >
                    <StageIcon stage={stage} className="size-[18px]" />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-semibold leading-tight">
                      {label}
                    </h2>
                    <p className="text-xs leading-tight text-ink-soft">{stage}</p>
                  </div>
                </div>

                <p className="text-sm leading-relaxed sm:mt-3">{blurb}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  예시를 눌러 바로 시작하거나, 가진 자료를 붙여넣고 평소 쓰는
                  말로 요청하세요.
                </p>

                {uploadCta}
                {wikiCta}

                {corpus && (
                  <div className="mt-4">
                    <CorpusPanel reloadKey={corpusVersion} />
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-2">
                  {starters.map((s) => (
                    <button
                      key={s}
                      onClick={() => void run.send(s, protect)}
                      className="group flex items-center gap-3 rounded-xl border border-line bg-surface py-3 pl-4 pr-3 text-left text-sm transition-shadow hover:shadow-[0_1px_3px_rgba(18,21,26,0.07)]"
                      style={{
                        borderLeftColor: STAGE_META[stage].color,
                        borderLeftWidth: 3,
                      }}
                    >
                      <span className="flex-1 leading-snug">{s}</span>
                      {/* Hidden until hover: twenty arrows sitting on a page do
                          not help anyone pick, they just add noise. */}
                      <span
                        aria-hidden
                        className="shrink-0 text-sm opacity-0 transition-opacity group-hover:opacity-100"
                        style={{ color: STAGE_META[stage].color }}
                      >
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {run.turns.map((turn, i) => (
              <Fragment key={i}>
              {turn.role === "user" ? (
                <div className="self-end max-w-[85%]">
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
                // What this app actually produces is long and structured —
                // clause tables, cited findings, action-item checklists. Bare
                // text on the page background gives that nothing to sit on and
                // no edge for a table to butt against.
                <>
                  <article className="prose-agent max-w-none rounded-xl border border-line bg-surface px-4 py-3.5 text-sm">
                    <ReactMarkdown>{turn.text}</ReactMarkdown>
                  </article>
                  {/* The check runs before the capture panel: deciding whether
                      an answer is trustworthy comes before deciding which of
                      its follow-ups to take on. */}
                  <AnswerCheck
                    answer={turn.text}
                    sourcePaths={
                      // The documents belong to the question, which is the turn
                      // before this one.
                      run.turns[i - 1]?.sourcePaths ?? []
                    }
                    workspace={slug}
                    onRetry={
                      // Only the newest answer can be retried, and only while
                      // nothing is running. Offering it on an old turn would
                      // append a reply to a question two exchanges back, which
                      // reads as the agent losing its place.
                      !busy && i === run.turns.length - 1 && run.turns[i - 1]
                        ? (faults) => retryWithFaults(run.turns[i - 1].text, faults)
                        : undefined
                    }
                  />
                  <ActionCapture answer={turn.text} workspace={slug} />
                </>
              )}
              {/* The trace belongs with the turn it explains — between the
                  question and the answer it produced, not after both. Anchored
                  to the last user turn so a finished conversation reads in the
                  order things actually happened. */}
              {i === lastUserTurn && (
                <ActivityTrace
                  tools={run.tools}
                  running={busy}
                  startedAt={run.startedAt}
                  agent={agent}
                />
              )}
              </Fragment>
            ))}

            {run.streaming && (
              <article className="prose-agent max-w-none rounded-xl border border-line bg-surface px-4 py-3.5 text-sm">
                <ReactMarkdown>{run.streaming}</ReactMarkdown>
              </article>
            )}

            {run.approval && (
              <div className="rounded-lg border border-warn/40 bg-warn/5 p-3.5">
                <div className="flex items-start gap-2">
                  <svg viewBox="0 0 16 16" className="mt-px size-4 shrink-0 text-warn" aria-hidden>
                    <path
                      d="M8 1.5 15 14H1L8 1.5Z M8 6v3.5 M8 11.6v.01"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-warn">
                      진행하려면 승인이 필요합니다
                    </p>
                    {/* The payload carries `description` and `command`. Dumping
                        the whole object made the reader parse JSON to answer a
                        yes/no question — and the two fields that decide it were
                        buried among run ids and timestamps. */}
                    {approvalDescription(run.approval.detail) && (
                      <p className="mt-1 text-sm leading-relaxed">
                        {approvalDescription(run.approval.detail)}
                      </p>
                    )}
                    {approvalCommand(run.approval.detail) && (
                      <pre className="mt-1.5 max-h-32 overflow-auto rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-[11px] leading-relaxed">
                        {approvalCommand(run.approval.detail)}
                      </pre>
                    )}
                  </div>
                </div>
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
                    {f.parsed && (
                      <span
                        title="문서를 텍스트로 변환해 전달합니다 (표 구조 유지)"
                        className="text-emerald-600"
                      >
                        변환됨
                      </span>
                    )}
                    {f.note && (
                      <span title={f.note} className="text-warn">
                        원본 전달
                      </span>
                    )}
                    {corpus && (
                      <button
                        onClick={() => void fileAsPrecedent(f)}
                        disabled={filing === f.path}
                        title="이 계약서를 선례 코퍼스에 추가합니다. 이후 다른 계약서를 검토할 때 비교 근거로 쓰입니다."
                        className="text-accent hover:underline disabled:opacity-50"
                      >
                        {filing === f.path ? "추가 중…" : "선례로 추가"}
                      </button>
                    )}
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
            {/* One surface rather than three controls in a row. The attach
                button, the field and send were separate boxes of different
                heights, which read as three unrelated widgets instead of one
                place to type. The border now belongs to the group and moves to
                the accent colour on focus-within. */}
            <div
              className={`flex items-end gap-1.5 rounded-xl border bg-surface px-2 py-1.5 transition-colors ${
                busy ? "border-line opacity-70" : "border-line focus-within:border-accent"
              }`}
            >
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
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-canvas hover:text-ink disabled:opacity-40"
              >
                {uploading ? (
                  <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-ink-soft" />
                ) : (
                  <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
                    <path
                      d="M13.5 6.5 8 12a2.12 2.12 0 0 0 3 3l5.5-5.5a4.24 4.24 0 0 0-6-6L5 9a6.36 6.36 0 0 0 9 9l4.5-4.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
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
                rows={1}
                placeholder={busy ? "실행 중…" : "요청을 입력하세요 (Shift+Enter 줄바꿈)"}
                disabled={busy}
                // Grows with the text instead of reserving two blank rows that
                // are empty almost all of the time.
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
                }}
                className="max-h-50 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed outline-none placeholder:text-ink-soft/70 disabled:opacity-60"
              />
              {busy ? (
                <button
                  onClick={() => void run.stop()}
                  title="중단"
                  aria-label="중단"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
                >
                  <span className="size-2.5 rounded-[2px] bg-current" />
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!draft.trim() && files.length === 0}
                  title="보내기"
                  aria-label="보내기"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-opacity disabled:opacity-25"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
                    <path
                      d="M10 16V4m0 0L5 9m5-5 5 5"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
            {/* Sits under the field as a status line rather than a form control:
                it is on by default and rarely touched, so it should read as a
                statement of what is happening, not a decision to make. */}
            <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-soft">
              <input
                type="checkbox"
                checked={protect}
                onChange={(e) => setProtect(e.target.checked)}
                className="size-3 accent-[var(--color-accent)]"
              />
              <span>
                고객정보 보호{" "}
                <span className="text-ink-soft/70">
                  — 이메일·전화·주민번호·사업자번호·카드·API 키·IP를 전송 전에 마스킹
                </span>
              </span>
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

/** The one sentence that decides the answer, if the payload carries it. */
function approvalDescription(detail: Record<string, unknown>): string {
  const d = detail.description;
  return typeof d === "string" ? d : "";
}

/** The exact command, so "이번만 허용" is an informed click and not a guess. */
function approvalCommand(detail: Record<string, unknown>): string {
  const c = detail.command;
  return typeof c === "string" ? c : "";
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
