"use client";

import { useMemo, useState } from "react";
import { extractCandidates, type ActionCandidate } from "@/lib/action-extract";

/**
 * Turns the follow-ups at the end of an answer into tracked items.
 *
 * Every playbook ends with next steps, and until now they scrolled away with the
 * conversation. This surfaces them as *proposals* under the answer, and only
 * what the user clicks gets saved.
 *
 * Nothing saves automatically. If every suggestion in every answer landed in the
 * task list, the list would be noise inside a week and people would stop opening
 * it — the same reason precedent has to be filed by hand.
 */
export default function ActionCapture({
  answer,
  workspace,
}: {
  answer: string;
  workspace: string;
}) {
  const candidates = useMemo(() => extractCandidates(answer), [answer]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (candidates.length === 0) return null;

  async function save(c: ActionCandidate) {
    setBusy(c.title);
    setError(null);
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: c.title,
          workspace,
          owner: c.owner,
          due: c.due,
          sourceText: c.sourceText,
        }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "저장에 실패했습니다.");
      setSaved((s) => ({ ...s, [c.title]: body.id! }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  const savedCount = Object.keys(saved).length;

  return (
    <section className="rounded-xl border border-line bg-surface/60 px-3.5 py-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-xs"
        aria-expanded={open}
      >
        <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-accent" aria-hidden>
          <path
            d="M2.5 8.5 6 12l7.5-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-medium">다음 액션 {candidates.length}건</span>
        <span className="text-ink-soft">
          {savedCount > 0 ? `${savedCount}건 저장됨` : "담을 것만 고르세요"}
        </span>
        <span className="flex-1" />
        <svg
          viewBox="0 0 12 12"
          className={`size-3 shrink-0 text-ink-soft transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          <path
            d="m4.5 2.5 3.5 3.5-3.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {candidates.map((c) => {
            const isSaved = c.title in saved;
            return (
              <li key={c.title} className="flex items-start gap-2 text-xs leading-snug">
                <button
                  onClick={() => void save(c)}
                  disabled={isSaved || busy === c.title}
                  aria-label={isSaved ? "저장됨" : `"${c.title}" 저장`}
                  className={`mt-px flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    isSaved
                      ? "border-accent bg-accent text-white"
                      : "border-line hover:border-accent"
                  }`}
                >
                  {isSaved && (
                    <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
                      <path
                        d="M2 6.2 4.6 8.8 10 3.2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
                <span className={`min-w-0 flex-1 ${isSaved ? "text-ink-soft" : ""}`}>
                  {c.title}
                  {(c.owner || c.due) && (
                    <span className="ml-1.5 text-ink-soft/70">
                      {c.owner && `담당 ${c.owner}`}
                      {c.owner && c.due && " · "}
                      {c.due && `기한 ${c.due}`}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
          {error && <li className="text-xs text-red-700">{error}</li>}
          {savedCount > 0 && (
            <li className="pt-1 text-[11px] text-ink-soft">
              <a href="/dashboard" className="text-accent hover:underline">
                대시보드에서 이행 현황 보기 →
              </a>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
