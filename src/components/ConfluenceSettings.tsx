"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * How to connect Confluence, and whether it is connected.
 *
 * The control that pulls in a wiki page hides itself when there are no
 * credentials, which is right — a button that always errors is worse than no
 * button — but on its own it repeats the mistake the paperclip made: something
 * the product can do is invisible, and nothing on screen says why. This page is
 * the answer to "왜 안 보이지".
 *
 * It shows which fields are set and never their values. A settings screen that
 * echoes a token back is one that leaks it into the next screenshot.
 */

interface Status {
  configured: boolean;
  host: string | null;
  mode: "cloud" | "datacenter";
  hasBase: boolean;
  hasEmail: boolean;
  hasToken: boolean;
}

function Field({ label, set, note }: { label: string; set: boolean; note: string }) {
  return (
    <li className="flex items-baseline gap-2.5 py-1.5">
      <span
        className="mt-px shrink-0 text-[11px] tabular-nums"
        style={{ color: set ? "var(--color-accent)" : "var(--color-ink-soft)" }}
        aria-label={set ? "설정됨" : "비어 있음"}
      >
        {set ? "설정됨" : "비었음"}
      </span>
      <span className="min-w-0">
        <code className="text-xs">{label}</code>
        <span className="ml-2 text-xs text-ink-soft">{note}</span>
      </span>
    </li>
  );
}

export default function ConfluenceSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch("/api/confluence")
      .then((r) => r.json())
      .then((d: Status) => setStatus(d))
      .catch(() => undefined);
  }, []);

  async function test() {
    if (!url.trim()) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/confluence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, sessionId: "settings-test" }),
      });
      const body = (await res.json()) as { name?: string; bytes?: number; error?: string };
      setResult(
        res.ok
          ? `가져왔습니다 — ${body.name} (${Math.round((body.bytes ?? 0) / 1024)}KB)`
          : (body.error ?? "실패했습니다."),
      );
    } catch {
      setResult("서버에 연결하지 못했습니다.");
    } finally {
      setTesting(false);
    }
  }

  const cloud = status?.mode === "cloud";

  return (
    <main className="page-enter flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-3xl px-6 pb-8 pt-12">
          <nav aria-label="위치" className="text-xs text-ink-soft">
            <Link href="/" className="hover:text-accent hover:underline">
              전체 업무
            </Link>
          </nav>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight">
            Confluence 연결
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            계약서가 파일이 아니라 위키 페이지로 올 때, 주소만 붙여넣으면 본문과 표를
            그대로 가져옵니다. 연결하면 워크스페이스에 &lsquo;주소로 가져오기&rsquo;가
            나타납니다.
          </p>

          {status && (
            <p
              className="mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
              style={{
                borderColor: status.configured ? "var(--color-accent)" : "var(--color-line)",
                color: status.configured ? "var(--color-accent)" : "var(--color-ink-soft)",
              }}
            >
              {status.configured
                ? `연결됨 · ${status.host} · ${cloud ? "Cloud" : "Data Center"} 방식`
                : "아직 연결되지 않았습니다"}
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-6 pb-12">
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold tracking-wide text-ink-soft">현재 설정</h2>
          {status ? (
            <ul className="mt-2 rounded-xl border border-line bg-surface px-4 py-2">
              <Field
                label="CONFLUENCE_BASE_URL"
                set={status.hasBase}
                note="위키 주소. 이 호스트의 페이지만 읽습니다."
              />
              <Field
                label="CONFLUENCE_API_TOKEN"
                set={status.hasToken}
                note={cloud ? "Atlassian API 토큰" : "Personal Access Token"}
              />
              <Field
                label="CONFLUENCE_EMAIL"
                set={status.hasEmail}
                note="Cloud 에서만 필요합니다. 사내 서버면 비워 두세요."
              />
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">확인 중…</p>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-[11px] font-semibold tracking-wide text-ink-soft">
            설정 방법
          </h2>
          <p className="mt-2 text-sm leading-relaxed">
            프로젝트 폴더의 <code className="text-xs">.env.local</code> 에 아래를 넣고
            서버를 다시 띄우면 됩니다. 이 값들은 서버에서만 읽으므로 브라우저로
            내려가지 않습니다.
          </p>

          {/* Both shapes are shown rather than one: which applies depends on
              whether the wiki is Atlassian's or the company's own, and being in
              the wrong one produces a 401 that says nothing about why. */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
              <p className="text-xs font-medium">Atlassian Cloud</p>
              <p className="mt-0.5 text-[11px] text-ink-soft">
                주소가 <code>*.atlassian.net</code> 인 경우
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-canvas px-2.5 py-2 text-[11px] leading-relaxed">
{`CONFLUENCE_BASE_URL=https://회사.atlassian.net/wiki
CONFLUENCE_EMAIL=you@company.com
CONFLUENCE_API_TOKEN=발급받은_토큰`}
              </pre>
              <p className="mt-1.5 text-[11px] text-ink-soft">
                토큰 발급:{" "}
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent hover:underline"
                >
                  id.atlassian.com
                </a>
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
              <p className="text-xs font-medium">사내 서버 (Data Center)</p>
              <p className="mt-0.5 text-[11px] text-ink-soft">
                사내 도메인에서 도는 경우
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-canvas px-2.5 py-2 text-[11px] leading-relaxed">
{`CONFLUENCE_BASE_URL=https://wiki.회사.com
CONFLUENCE_API_TOKEN=Personal_Access_Token`}
              </pre>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
                <code>CONFLUENCE_EMAIL</code> 은 넣지 않습니다 — 이메일이 있으면 Cloud
                방식으로 인증을 시도해 401 이 납니다. 토큰은 Confluence 프로필 &gt;
                개인 액세스 토큰에서 발급합니다.
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            <code>BASE_URL</code> 은 페이지 주소가 아니라 위키의 뿌리 주소입니다.
            페이지가 <code>https://wiki.회사.com/pages/12345</code> 라면{" "}
            <code>https://wiki.회사.com</code> 까지만 넣습니다. 여기 적힌 호스트와
            정확히 같은 주소만 읽으므로, 다른 사이트 주소를 넣으면 거부됩니다.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-[11px] font-semibold tracking-wide text-ink-soft">
            주소로 확인해 보기
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            페이지 하나를 넣어 실제로 읽히는지 봅니다. 워크스페이스에서 처음
            시도하다 막히는 것보다, 여기서 한 번 확인하는 편이 빠릅니다.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void test()}
              placeholder="https://wiki.회사.com/pages/12345"
              aria-label="확인할 Confluence 페이지 주소"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
            />
            <button
              onClick={() => void test()}
              disabled={!url.trim() || testing}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {testing ? "확인 중…" : "확인"}
            </button>
          </div>
          {result && (
            <p className="mt-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed">
              {result}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
