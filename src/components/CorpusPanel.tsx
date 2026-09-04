"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * What the precedent corpus currently holds.
 *
 * Contract answers cite precedent by filename — "선례 표준공급계약서_2026 제5조는
 * 0.1%". Until now there was no way to see which contracts those were, or that
 * the corpus was empty. Both matter:
 *
 * - An empty corpus makes every answer fall back to "관행상", and nothing on
 *   screen said why. The user would reasonably conclude the tool is vague.
 * - A cited filename the reader has never seen is a claim they cannot check.
 *
 * So the workspace shows the list, and says plainly when there is nothing in it.
 */

interface CorpusState {
  available: boolean;
  indexed: boolean;
  documents: string[];
}

export default function CorpusPanel({ reloadKey }: { reloadKey: number }) {
  const [state, setState] = useState<CorpusState | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch("/api/corpus")
      .then((r) => r.json())
      .then((d: CorpusState) => setState(d))
      .catch(() => undefined);
  }, []);

  // `reloadKey` changes when a document is filed, so the list reflects it
  // without the user having to reload the page to believe it worked.
  useEffect(load, [load, reloadKey]);

  if (!state?.available) return null;

  const count = state.documents.length;

  return (
    <div className="rounded-xl border border-line bg-surface/60 px-3.5 py-2.5 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
        disabled={count === 0}
      >
        <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-ink-soft" aria-hidden>
          <path
            d="M2.5 4.5v7a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-7M2.5 4.5 4 2.5h8l1.5 2M2.5 4.5h11M6.5 7.5h3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {count === 0 ? (
          <span className="text-ink-soft">
            선례 코퍼스가 비어 있습니다 — 계약서를 올리고 &lsquo;선례로 추가&rsquo;를
            누르면 이후 검토가 그 조건을 근거로 씁니다.
          </span>
        ) : (
          <>
            <span className="font-medium">선례 {count}건</span>
            <span className="text-ink-soft">검토·대책이 이 문서들을 근거로 씁니다</span>
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
          </>
        )}
      </button>

      {open && count > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-l border-line pl-3">
          {state.documents.map((d) => (
            <li key={d} className="truncate text-ink-soft">
              {d}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
