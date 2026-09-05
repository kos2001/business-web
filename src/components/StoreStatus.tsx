"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "./PageHeader";
import FindingCard from "./FindingCard";
import type { StoreStatus } from "@/lib/store-status";

/**
 * What the app is holding, and whether it can be trusted.
 *
 * Presented as findings first and inventory second, for the same reason the
 * domain dashboards are: totals answer "how much", and nobody is asking that.
 * The question behind "코퍼스 상태 좀 보자" is whether the next contract review
 * will actually have precedent to stand on, and the answers that matter are the
 * ones a count cannot give — a document on disk that search has never seen, an
 * upload an hour from deletion.
 *
 * When nothing is wrong the findings section is absent rather than green. A
 * status page that always has a row in it is one people stop reading, and this
 * one only earns its place on the days something is off.
 */

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function when(iso: string | null): string {
  if (!iso) return "없음";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}시간 전`;
  return `${Math.round(mins / 1440)}일 전`;
}

export default function StoreStatusView() {
  const [data, setData] = useState<StoreStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d: StoreStatus) => setData(d))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function reindex() {
    setReindexing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/corpus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reindex" }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      setMessage(body.message ?? body.error ?? "색인을 마쳤습니다.");
      load();
    } catch {
      setMessage("색인 요청이 실패했습니다.");
    } finally {
      setReindexing(false);
    }
  }

  const corpus = data?.corpus;
  const canReindex = Boolean(corpus?.available && corpus.documents.length > 0);

  return (
    <main className="page-enter flex min-w-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        title="문서와 저장소"
        lead="검토가 근거로 쓰는 선례, 아직 쓰이지 않은 임시 파일, 담긴 액션이 어디에 얼마나 있는지. 문제가 있으면 맨 위에 나옵니다."
        crumbs={[{ label: "전체 업무", href: "/" }]}
      />

      <div className="mx-auto w-full max-w-3xl px-6 pb-12">
        {loading ? (
          <p className="mt-6 text-sm text-ink-soft">불러오는 중…</p>
        ) : !data ? (
          <p className="mt-6 text-sm text-ink-soft">상태를 불러오지 못했습니다.</p>
        ) : (
          <>
            {data.findings.length > 0 && (
              <section className="mt-8">
                <h2 className="text-[11px] font-semibold tracking-wide text-ink-soft">
                  확인이 필요합니다
                </h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {data.findings.map((f) => (
                    <FindingCard
                      key={f.title}
                      severity={f.severity}
                      title={f.title}
                      why={f.why}
                    />
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-8">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[11px] font-semibold tracking-wide text-ink-soft">
                  선례 코퍼스
                </h2>
                <span className="text-[11px] text-ink-soft">
                  계약서 분석·협상 대책이 답하기 전에 찾아보는 곳
                </span>
                <span className="flex-1" />
                {canReindex && (
                  <button
                    onClick={() => void reindex()}
                    disabled={reindexing}
                    className="rounded-md border border-line px-2 py-0.5 text-[11px] transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {reindexing ? "색인 중…" : "다시 색인"}
                  </button>
                )}
              </div>

              <div className="mt-2 rounded-xl border border-line bg-surface px-4 py-3">
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span>
                    문서 <span className="tabular-nums font-medium">{corpus!.documents.length}</span>건
                  </span>
                  <span className="text-ink-soft">{human(corpus!.bytes)}</span>
                  <span className="text-ink-soft">색인 {when(corpus!.indexedAt)}</span>
                  {!corpus!.available && (
                    <span style={{ color: "var(--color-warn)" }}>docparser 없음</span>
                  )}
                </p>

                {corpus!.documents.length === 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                    아직 선례가 없습니다. 계약 워크스페이스에서 계약서를 올린 뒤
                    &lsquo;선례로 추가&rsquo;를 누르면 여기 쌓입니다.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col divide-y divide-line">
                    {corpus!.documents.map((d) => {
                      const stale = corpus!.unindexed.includes(d.name);
                      return (
                        <li
                          key={d.name}
                          className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-xs"
                        >
                          <span className="min-w-0 flex-1 truncate">{d.name}</span>
                          {stale && (
                            <span
                              className="shrink-0 text-[11px]"
                              style={{ color: "var(--color-warn)" }}
                            >
                              색인 안 됨
                            </span>
                          )}
                          <span className="shrink-0 text-[11px] text-ink-soft">
                            {human(d.bytes)}
                          </span>
                          <span className="shrink-0 text-[11px] text-ink-soft">
                            {when(d.at)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {message && (
                  <p className="mt-2 border-t border-line pt-2 text-xs">{message}</p>
                )}
              </div>
            </section>

            <section className="mt-8">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[11px] font-semibold tracking-wide text-ink-soft">
                  임시 보관
                </h2>
                <span className="text-[11px] text-ink-soft">
                  올렸지만 아직 선례가 아닌 파일 · 24시간 뒤 삭제
                </span>
              </div>
              <div className="mt-2 rounded-xl border border-line bg-surface px-4 py-3">
                {data.staging.files.length === 0 ? (
                  <p className="text-xs text-ink-soft">보관 중인 파일이 없습니다.</p>
                ) : (
                  <>
                    <p className="text-xs">
                      <span className="tabular-nums font-medium">
                        {data.staging.files.length}
                      </span>
                      건 · <span className="text-ink-soft">{human(data.staging.bytes)}</span>
                    </p>
                    <ul className="mt-2 flex flex-col divide-y divide-line">
                      {data.staging.files.slice(0, 20).map((f) => (
                        <li
                          key={`${f.session}/${f.name}`}
                          className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-xs"
                        >
                          <span className="min-w-0 flex-1 truncate">{f.name}</span>
                          <span className="shrink-0 text-[11px] text-ink-soft">
                            {human(f.bytes)}
                          </span>
                          <span className="shrink-0 text-[11px] text-ink-soft">
                            {when(f.at)} 올림
                          </span>
                        </li>
                      ))}
                    </ul>
                    {data.staging.files.length > 20 && (
                      <p className="mt-1.5 text-[11px] text-ink-soft">
                        외 {data.staging.files.length - 20}건
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>

            <section className="mt-8">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[11px] font-semibold tracking-wide text-ink-soft">
                  액션 DB
                </h2>
                <span className="text-[11px] text-ink-soft">담은 다음 액션이 사는 곳</span>
              </div>
              <div className="mt-2 rounded-xl border border-line bg-surface px-4 py-3">
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span>
                    {/* null means the database would not open, which is not the
                        same as being empty and must not read as it. */}
                    항목{" "}
                    <span className="tabular-nums font-medium">
                      {data.actions.rows === null ? "확인 불가" : `${data.actions.rows}건`}
                    </span>
                  </span>
                  <span className="text-ink-soft">
                    {data.actions.exists ? human(data.actions.bytes) : "파일 없음"}
                  </span>
                  <Link href="/dashboard" className="text-accent hover:underline">
                    내용 보기 →
                  </Link>
                </p>
              </div>
            </section>

            <p className="mt-6 break-all text-[11px] leading-relaxed text-ink-soft">
              선례 {corpus!.root}
              <br />
              임시 {data.staging.root}
              <br />
              액션 {data.actions.path}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
