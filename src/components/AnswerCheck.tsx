"use client";

import { useEffect, useState } from "react";
import type { AnswerReview } from "@/lib/answer-review";

/**
 * The verdict on one answer.
 *
 * ## Why this is on the screen at all
 *
 * The model behind the sales profile sometimes derails on long Korean output.
 * A live contract review came back with a decoder loop mid-summary and half its
 * clauses missing, and the half it produced was well-formed enough to read as
 * finished. That is the case this exists for: not the obviously broken answer,
 * but the plausible one.
 *
 * ## Why it is quiet when clean
 *
 * A green tick on every answer becomes furniture within a day, and furniture is
 * not read on the day it matters. Clean answers get one grey line; problems get
 * a bordered panel that is open already. The asymmetry is the point.
 *
 * ## Why there is a retry button but no automatic rewrite
 *
 * The panel first shipped as a report with nothing to press, on the reasoning
 * that repairing a contract review would hide that it was unreliable. That
 * reasoning holds for a *silent* repair and not for this: when three typos are
 * named on screen, leaving the reader to retype the question themselves is
 * making them do the work of a button.
 *
 * So the retry is user-initiated, visible in the transcript as a new turn, and
 * it carries the specific faults into the new prompt — a plain re-run rolls the
 * dice again, while naming 무상한 배상 and 반도체 부종 gives the model something
 * to avoid. The bad answer stays on screen above the new one. Nothing is
 * overwritten, which is the part that mattered all along.
 */

const KIND_LABEL: Record<string, string> = {
  spelling: "맞춤법",
  "broken-context": "문맥 끊김",
  "table-misread": "표 오독",
  number: "수치",
};

export default function AnswerCheck({
  answer,
  sourcePaths,
  onRetry,
}: {
  answer: string;
  sourcePaths: string[];
  /** Absent while a run is in flight, which is when retrying is meaningless. */
  onRetry?: (faults: string[]) => void;
}) {
  const [review, setReview] = useState<AnswerReview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setReview(null);
    setFailed(false);
    fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer, sourcePaths }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<AnswerReview>) : Promise.reject()))
      .then((d) => live && setReview(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
    // sourcePaths is rebuilt each render by the parent; the answer identifies
    // the turn, and re-checking the same text would only cost another run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer]);

  if (failed) {
    return (
      <p className="px-1 text-[11px] text-ink-soft">
        검수를 실행하지 못했습니다 — 이 답변은 확인되지 않았습니다.
      </p>
    );
  }

  if (!review) {
    // Naming the agent while it works, not just afterwards: a spinner labelled
    // "검수 중" looks like the page thinking, and this is a second agent on
    // another machine spending another model call. That should be visible while
    // it happens, because it is what the wait is for.
    return (
      <p className="flex items-center gap-1.5 px-1 text-[11px] text-ink-soft">
        <span className="size-2.5 animate-spin rounded-full border-[1.5px] border-line border-t-ink-soft" />
        검수 에이전트가 읽는 중…
      </p>
    );
  }

  const by = review.reviewer
    ? `${review.reviewer.upstream} 검수`
    : "검수";

  const problems = [
    ...review.mechanical.map((m) => ({ tag: "손상", text: m.label, quote: m.evidence })),
    ...review.findings.map((f) => ({
      tag: KIND_LABEL[f.kind] ?? f.kind,
      text: f.reason,
      quote: f.quote,
    })),
    ...review.source
      .filter((s) => s.kind === "misquote")
      .map((s) => ({ tag: "인용", text: s.label, quote: s.evidence })),
  ];

  // Unsourced figures are shown apart from the problems: they are usually the
  // agent's own proposal, and mixing them in would make every answer look wrong.
  const unsourced = review.source
    .filter((s) => s.kind === "unsourced-number")
    .map((s) => s.evidence);

  if (problems.length === 0) {
    return (
      <p className="px-1 text-[11px] text-ink-soft">
        {review.ran ? `${by} 통과` : "검수 미실행 — 확인되지 않았습니다"}
        {unsourced.length > 0 && (
          <>
            {" · "}
            <span title="문서에 없는 수치입니다. 제안값이면 정상입니다.">
              문서에 없는 수치 {unsourced.length}건: {unsourced.slice(0, 6).join(", ")}
            </span>
          </>
        )}
      </p>
    );
  }

  return (
    <section
      className="rounded-xl border bg-surface px-3.5 py-3"
      style={{ borderColor: "var(--color-warn)", borderLeftWidth: 3 }}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--color-warn)" }}>
        <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden>
          <path
            d="M8 5.5v3.5M8 11.5h.01M8 1.8 1.3 13.5h13.4L8 1.8z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        이 답변에 문제 {problems.length}건 — 그대로 쓰지 마세요
      </p>
      <p className="mt-0.5 text-[11px] text-ink-soft">
        {by} · 답변을 쓴 에이전트와 다른 모델이 확인했습니다
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {problems.map((p, i) => (
          <li key={i} className="text-xs leading-snug">
            <span className="mr-1.5 rounded bg-canvas px-1.5 py-0.5 text-[10px] text-ink-soft">
              {p.tag}
            </span>
            {p.text}
            {p.quote && (
              <span className="mt-0.5 block break-words font-mono text-[11px] text-ink-soft">
                {p.quote}
              </span>
            )}
          </li>
        ))}
      </ul>
      {unsourced.length > 0 && (
        <p className="mt-2 border-t border-line pt-2 text-[11px] text-ink-soft">
          문서에 없는 수치: {unsourced.slice(0, 8).join(", ")} — 제안값이면 정상입니다.
        </p>
      )}
      {onRetry && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2.5">
          <button
            onClick={() =>
              onRetry(problems.map((p) => (p.quote ? `${p.quote} — ${p.text}` : p.text)))
            }
            className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs transition-colors hover:border-accent hover:text-accent"
          >
            이 문제들을 알려주고 다시 작성
          </button>
          <span className="text-[11px] text-ink-soft">
            위 답변은 지우지 않고 아래에 새로 붙습니다.
          </span>
        </div>
      )}
    </section>
  );
}
