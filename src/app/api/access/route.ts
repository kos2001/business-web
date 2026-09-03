import { NextResponse } from "next/server";
import {
  addDomain,
  bootstrapAdmins,
  isAdmin,
  readAccessList,
  removeDomain,
  removePerson,
  roleOf,
  upsertPerson,
  type Role,
} from "@/lib/access";
import { authConfigured, currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Reading and editing the access list.
 *
 * Every handler re-derives the caller's role from the list on disk. The session
 * cookie says who you are and nothing about what you may do, so demoting or
 * removing an admin takes effect on their very next request rather than
 * whenever their cookie happens to expire.
 *
 * With no IdP configured there is no caller to check and nobody to protect the
 * list from, so the endpoint reports that state instead of pretending to
 * enforce something.
 */
async function requireAdmin(): Promise<
  { ok: true; email: string } | { ok: false; res: NextResponse }
> {
  if (!authConfigured()) {
    return {
      ok: false,
      res: NextResponse.json(
        {
          error:
            "OIDC 가 설정되지 않아 인가 목록을 쓸 수 없습니다. OIDC_ISSUER 와 SESSION_SECRET 을 설정하세요.",
        },
        { status: 409 },
      ),
    };
  }

  const user = await currentUser();
  if (!user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }
  if (!isAdmin(user.email)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "관리자만 인가 목록을 변경할 수 있습니다." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, email: user.email };
}

export async function GET() {
  const list = readAccessList();
  const user = await currentUser();

  return NextResponse.json({
    ...list,
    bootstrapAdmins: bootstrapAdmins(),
    authConfigured: authConfigured(),
    me: user
      ? { email: user.email, name: user.name, role: roleOf(user.email) }
      : null,
  });
}

interface Body {
  action?: "addPerson" | "removePerson" | "addDomain" | "removeDomain";
  email?: string;
  role?: Role;
  note?: string;
  domain?: string;
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  switch (body.action) {
    case "addPerson": {
      const email = (body.email ?? "").trim().toLowerCase();
      if (!email.includes("@")) {
        return NextResponse.json(
          { error: "올바른 이메일 주소를 입력하세요." },
          { status: 400 },
        );
      }
      const list = upsertPerson({
        email,
        role: body.role === "admin" ? "admin" : "member",
        note: body.note?.trim() || undefined,
        addedBy: auth.email,
      });
      return NextResponse.json(list);
    }

    case "removePerson": {
      const result = removePerson(body.email ?? "");
      if (!result.removed) {
        return NextResponse.json(
          { error: result.reason ?? "삭제하지 못했습니다." },
          { status: 400 },
        );
      }
      return NextResponse.json(result.list);
    }

    case "addDomain": {
      const domain = (body.domain ?? "").trim().toLowerCase().replace(/^@/, "");
      if (!domain.includes(".")) {
        return NextResponse.json(
          { error: "올바른 도메인을 입력하세요. 예: example.com" },
          { status: 400 },
        );
      }
      return NextResponse.json(addDomain(domain, auth.email));
    }

    case "removeDomain":
      return NextResponse.json(removeDomain(body.domain ?? ""));

    default:
      return NextResponse.json(
        { error: "알 수 없는 작업입니다." },
        { status: 400 },
      );
  }
}
