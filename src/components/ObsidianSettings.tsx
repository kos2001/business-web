"use client";

import { useEffect, useState } from "react";
import PageHeader from "./PageHeader";

/**
 * Where the vault is, and whether it is there.
 *
 * The save button hides itself when unconfigured — right, and silent. This is
 * the page that answers "왜 노트로 저장이 안 보이지", the same role the
 * Confluence settings page plays for the wiki import.
 */
interface Status {
  configured: boolean;
  vault: string | null;
  folder: string;
  vaultMissing: boolean;
}

export default function ObsidianSettings() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/note")
      .then((r) => r.json())
      .then((d: Status) => setStatus(d))
      .catch(() => undefined);
  }, []);

  return (
    <main className="page-enter flex min-w-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        title="Obsidian 노트"
        lead="계약 검토 결과를 보관함에 노트로 남깁니다. 답변은 새로고침하면 사라지지만 노트는 남습니다."
        crumbs={[{ label: "전체 업무", href: "/" }]}
      >
        {status && (
          <p
            className="mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
            style={{
              borderColor: status.configured
                ? "var(--color-accent)"
                : status.vaultMissing
                  ? "var(--color-warn)"
                  : "var(--color-line)",
              color: status.configured
                ? "var(--color-accent)"
                : status.vaultMissing
                  ? "var(--color-warn)"
                  : "var(--color-ink-soft)",
            }}
          >
            {status.configured
              ? `연결됨 · ${status.vault}/${status.folder}`
              : status.vaultMissing
                ? `경로가 설정됐지만 찾을 수 없습니다: ${status.vault}`
                : "아직 연결되지 않았습니다"}
          </p>
        )}
      </PageHeader>

      <div className="mx-auto w-full max-w-4xl px-6 pb-12">
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold tracking-wide text-ink-soft">설정 방법</h2>
          <p className="mt-2 text-sm leading-relaxed">
            프로젝트 폴더의 <code className="text-xs">.env.local</code> 에 보관함 경로를
            넣고 서버를 다시 띄우면, 답변 아래에 &lsquo;노트로 저장&rsquo;이 나타납니다.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-canvas px-3 py-2.5 text-[11px] leading-relaxed">
{`OBSIDIAN_VAULT_PATH=/Users/이름/Documents/보관함
OBSIDIAN_NOTE_FOLDER=영업 에이전트   # 선택, 기본값`}
          </pre>
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            노트는 보관함 안의 그 폴더에만 쓰입니다. 같은 제목이 이미 있으면
            덮어쓰지 않고 시각을 붙여 새로 만듭니다 — 두 번째 검토는 첫 번째를
            지울 이유가 없습니다.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-[11px] font-semibold tracking-wide text-ink-soft">저장되는 내용</h2>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-surface px-3.5 py-3 text-[11px] leading-relaxed">
{`---
title: "A사 공급계약 검토"
date: 2026-09-05
workspace: contract
tags: [영업에이전트]
sources: ["A사_공급계약_2025.docx"]
---

# A사 공급계약 검토

(답변 원문 그대로)

## 근거 문서
- [[A사_공급계약_2025.docx]]`}
          </pre>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            근거 문서는 wikilink 로 넣어 노트가 그래프에 붙게 합니다. 보관함에서
            읽어오지는 않습니다 — 계약서는 이미 선례 코퍼스가 갖고 있고, 같은
            문서를 두 곳에서 읽으면 둘이 어긋나기 시작합니다.
          </p>
        </section>
      </div>
    </main>
  );
}
