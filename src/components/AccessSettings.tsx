"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AccessList, Role } from "@/lib/access";

interface Payload extends AccessList {
  bootstrapAdmins: string[];
  authConfigured: boolean;
  me: { email: string; name?: string; role: Role | null } | null;
}

/**
 * The access list, as a page an admin can actually run.
 *
 * Two things it deliberately makes visible rather than hiding behind a
 * successful save. **Who granted access and when** — a list of addresses with
 * no provenance becomes unauditable within a month, and the first question
 * anyone asks about an unexpected name is who added it. And **the difference
 * between a person and a domain rule**, because they are not the same risk: one
 * address is a decision, a domain is a standing rule that admits people who
 * have not been hired yet.
 */
export default function AccessSettings() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [note, setNote] = useState("");
  const [domain, setDomain] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/access", { cache: "no-store" });
      if (!res.ok) throw new Error("인가 목록을 불러오지 못했습니다.");
      setData((await res.json()) as Payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as Partial<Payload> & {
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <p className="p-6 text-sm text-ink-soft">
        {error ?? "불러오는 중…"}
      </p>
    );
  }

  const canEdit = data.authConfigured && data.me?.role === "admin";

  return (
    <div className="mx-auto max-w-3xl px-6 py-9">
      <Link href="/" className="text-xs text-ink-soft hover:text-accent">
        ← 홈
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">접근 권한</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        회사 계정(SSO)으로 신원을 확인한 뒤, 이 목록에 있는 사람만 들어올 수
        있습니다. 신원 확인과 사용 권한은 별개입니다 — 회사 계정이 있다고
        자동으로 허용되지 않습니다.
      </p>

      {!data.authConfigured && (
        <p className="mt-4 rounded-lg border border-warn/40 bg-warn/5 px-3.5 py-3 text-sm leading-relaxed text-warn">
          <strong className="font-medium">SSO 가 설정되지 않았습니다.</strong>{" "}
          지금은 로그인 없이 누구나 접근할 수 있고, 이 목록은 적용되지 않습니다.
          <code className="mx-1">OIDC_ISSUER</code>와
          <code className="mx-1">SESSION_SECRET</code>을 설정하면 즉시 적용됩니다.
        </p>
      )}

      {data.authConfigured && data.me?.role !== "admin" && (
        <p className="mt-4 rounded-lg border border-line bg-surface px-3.5 py-3 text-sm text-ink-soft">
          보기 전용입니다. 변경하려면 관리자 권한이 필요합니다.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      {data.bootstrapAdmins.length > 0 && (
        <p className="mt-4 rounded-lg border border-line bg-canvas px-3.5 py-3 text-xs leading-relaxed text-ink-soft">
          <strong className="font-medium text-ink">
            환경변수로 지정된 초기 관리자
          </strong>{" "}
          — {data.bootstrapAdmins.join(", ")}. 목록이 비어 있어도 이 주소는 항상
          관리자입니다. 실제 관리자를 아래에 추가한 뒤에는
          <code className="mx-1">ACCESS_BOOTSTRAP_ADMINS</code>를 지우세요.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">
          사용자{" "}
          <span className="font-normal text-ink-soft">
            ({data.people.length}명)
          </span>
        </h2>

        {canEdit && (
          <div className="mt-2.5 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface p-3">
            <label className="flex-1 min-w-56">
              <span className="block text-[11px] text-ink-soft">이메일</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hong@example.com"
                className="mt-1 w-full rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <label>
              <span className="block text-[11px] text-ink-soft">권한</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="mt-1 rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              >
                <option value="member">사용자</option>
                <option value="admin">관리자</option>
              </select>
            </label>
            <label className="flex-1 min-w-40">
              <span className="block text-[11px] text-ink-soft">메모</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="영업1팀"
                className="mt-1 w-full rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <button
              disabled={busy || !email.includes("@")}
              onClick={async () => {
                if (await act({ action: "addPerson", email, role, note })) {
                  setEmail("");
                  setNote("");
                  setRole("member");
                }
              }}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              추가
            </button>
          </div>
        )}

        {data.people.length === 0 ? (
          <p className="mt-2.5 rounded-lg border border-dashed border-line px-3.5 py-4 text-sm text-ink-soft">
            아직 등록된 사용자가 없습니다.
          </p>
        ) : (
          <ul className="mt-2.5 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {data.people.map((p) => (
              <li
                key={p.email}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{p.email}</span>
                  <span className="block text-[11px] text-ink-soft">
                    {p.addedBy} 가 {formatDate(p.addedAt)} 추가
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    p.role === "admin"
                      ? "bg-accent/10 text-accent"
                      : "bg-canvas text-ink-soft"
                  }`}
                >
                  {p.role === "admin" ? "관리자" : "사용자"}
                </span>
                {canEdit && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act({
                          action: "addPerson",
                          email: p.email,
                          role: p.role === "admin" ? "member" : "admin",
                          note: p.note,
                        })
                      }
                      className="shrink-0 text-xs text-ink-soft hover:text-accent disabled:opacity-40"
                    >
                      {p.role === "admin" ? "사용자로" : "관리자로"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`${p.email} 의 접근 권한을 제거할까요?`))
                          void act({ action: "removePerson", email: p.email });
                      }}
                      className="shrink-0 text-xs text-ink-soft hover:text-red-600 disabled:opacity-40"
                    >
                      삭제
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">도메인 허용</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          해당 도메인의 회사 계정이면 모두 <strong>사용자</strong> 권한으로
          들어옵니다. 아직 입사하지 않은 사람까지 미리 허용하는 규칙이므로,
          관리자는 이 방식으로 부여되지 않습니다.
        </p>

        {canEdit && (
          <div className="mt-2.5 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface p-3">
            <label className="flex-1 min-w-56">
              <span className="block text-[11px] text-ink-soft">도메인</span>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                className="mt-1 w-full rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <button
              disabled={busy || !domain.includes(".")}
              onClick={async () => {
                if (await act({ action: "addDomain", domain })) setDomain("");
              }}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              추가
            </button>
          </div>
        )}

        {data.domains.length === 0 ? (
          <p className="mt-2.5 rounded-lg border border-dashed border-line px-3.5 py-4 text-sm text-ink-soft">
            등록된 도메인이 없습니다. 개별 사용자만 접근할 수 있습니다.
          </p>
        ) : (
          <ul className="mt-2.5 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {data.domains.map((d) => (
              <li
                key={d.domain}
                className="flex items-center gap-3 px-3.5 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">@{d.domain}</span>
                  <span className="block text-[11px] text-ink-soft">
                    {d.addedBy} 가 {formatDate(d.addedAt)} 추가
                  </span>
                </span>
                {canEdit && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`@${d.domain} 허용을 해제할까요?`))
                        void act({ action: "removeDomain", domain: d.domain });
                    }}
                    className="shrink-0 text-xs text-ink-soft hover:text-red-600 disabled:opacity-40"
                  >
                    삭제
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.me && (
        <footer className="mt-9 flex items-center justify-between border-t border-line pt-4 text-xs text-ink-soft">
          <span>
            {data.me.name ? `${data.me.name} · ` : ""}
            {data.me.email}
          </span>
          <form action="/api/auth/logout" method="post">
            <button className="rounded-md border border-line px-2.5 py-1 hover:bg-canvas">
              로그아웃
            </button>
          </form>
        </footer>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("ko-KR");
}
