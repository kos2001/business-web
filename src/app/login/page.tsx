import Link from "next/link";
import { oidcConfigured } from "@/lib/oidc";

export const dynamic = "force-dynamic";

/**
 * The login screen.
 *
 * It shows the reason a login failed rather than a generic message, because
 * the two failures here need opposite reactions from the user: a broken
 * transaction means try again, while "you are not on the access list" means
 * stop trying and go ask someone. Sending both round the same loop is how
 * people end up filing a bug against the login button.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const configured = oidcConfigured();
  const href = `/api/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-accent text-xs font-bold text-white">
            영
          </span>
          <h1 className="text-lg font-semibold tracking-tight">영업 에이전트</h1>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          회사 계정으로 로그인하세요. 고객 정보와 계약·가격 자료를 다루므로
          승인된 사용자만 들어올 수 있습니다.
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-warn/40 bg-warn/5 px-3.5 py-3 text-sm leading-relaxed text-warn">
            {error}
          </p>
        )}

        {configured ? (
          <a
            href={href}
            className="mt-5 block rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-medium text-white hover:opacity-90"
          >
            회사 계정으로 로그인 (SSO)
          </a>
        ) : (
          <div className="mt-5 rounded-lg border border-line bg-surface p-4">
            <p className="text-sm font-medium">SSO 가 설정되지 않았습니다</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
              <code>.env.local</code> 에 <code>OIDC_ISSUER</code>,{" "}
              <code>OIDC_CLIENT_ID</code>, <code>OIDC_REDIRECT_URI</code>,{" "}
              <code>SESSION_SECRET</code> 을 설정하면 이 버튼이 활성화됩니다.
              설정 전까지는 로그인 없이 접근할 수 있습니다.
            </p>
            <Link
              href="/"
              className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
            >
              로그인 없이 계속 →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
