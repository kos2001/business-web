import { NextResponse } from "next/server";
import { completeLogin, TX_COOKIE, type OidcTransaction } from "@/lib/oidc";
import { isAuthorized, persistBootstrapAdmin } from "@/lib/access";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Where authentication meets authorization.
 *
 * The IdP has proved who this is. That is not the same as deciding they may be
 * here: a corporate tenant will authenticate the whole company. So the verified
 * address is checked against the access list, and a valid login by someone not
 * on it is turned away with a distinct message — no session cookie is issued.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const deny = (reason: string) =>
    NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(reason)}`, url.origin),
    );

  const raw = req.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith(`${TX_COOKIE}=`))
    ?.slice(TX_COOKIE.length + 1);

  if (!raw) {
    return deny(
      "로그인 요청 정보가 없습니다. 만료되었을 수 있습니다. 다시 시도해 주세요.",
    );
  }

  let tx: OidcTransaction;
  try {
    tx = JSON.parse(decodeURIComponent(raw)) as OidcTransaction;
  } catch {
    return deny("로그인 요청 정보가 손상되었습니다. 다시 시도해 주세요.");
  }

  try {
    const claims = await completeLogin(url, tx);

    if (!isAuthorized(claims.email)) {
      // Deliberately specific: the person authenticated fine, so "로그인 실패"
      // would send them round the loop again. They need to know to ask an
      // admin.
      return deny(
        `${claims.email} 계정은 사용 권한이 없습니다. 관리자에게 접근 권한을 요청하세요.`,
      );
    }

    persistBootstrapAdmin(claims.email);

    const token = await createSessionToken(claims);
    const res = NextResponse.redirect(new URL(tx.next || "/", url.origin));
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    res.cookies.delete(TX_COOKIE); // single use
    return res;
  } catch (err) {
    return deny(err instanceof Error ? err.message : String(err));
  }
}
