import { NextResponse } from "next/server";
import {
  createAction,
  deleteAction,
  listActions,
  summarise,
  updateAction,
  type ActionStatus,
  type Level,
} from "@/lib/actions";

export const dynamic = "force-dynamic";

const STATUSES: ActionStatus[] = ["open", "in_progress", "done", "dropped"];
const LEVELS: Level[] = ["high", "mid", "low"];

function level(v: unknown): Level | null {
  return typeof v === "string" && (LEVELS as string[]).includes(v) ? (v as Level) : null;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const status = q.get("status");
  return NextResponse.json({
    items: listActions({
      status:
        status === "active" || (status && (STATUSES as string[]).includes(status))
          ? (status as ActionStatus | "active")
          : undefined,
      workspace: q.get("workspace") ?? undefined,
    }),
    summary: summarise(),
  });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const workspace = String(body.workspace ?? "").trim();
  if (!title || !workspace) {
    return NextResponse.json(
      { error: "title 과 workspace 는 필수입니다." },
      { status: 400 },
    );
  }

  // A due date that is not a date is worse than no due date: the dashboard sorts
  // and filters on it, and a bad value quietly lands the item in the wrong tile.
  const dueRaw = typeof body.due === "string" ? body.due.trim() : "";
  if (dueRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dueRaw)) {
    return NextResponse.json(
      { error: "due 는 YYYY-MM-DD 형식이어야 합니다." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    createAction({
      title,
      workspace,
      owner: typeof body.owner === "string" ? body.owner : null,
      due: dueRaw || null,
      priority: level(body.priority),
      impact: level(body.impact),
      effort: level(body.effort),
      sourceText: typeof body.sourceText === "string" ? body.sourceText : null,
    }),
    { status: 201 },
  );
}

export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id 가 없습니다." }, { status: 400 });

  const status = body.status;
  if (status !== undefined && !(STATUSES as unknown[]).includes(status)) {
    return NextResponse.json(
      { error: `status 는 ${STATUSES.join(", ")} 중 하나여야 합니다.` },
      { status: 400 },
    );
  }

  const updated = updateAction(id, {
    ...(status !== undefined ? { status: status as ActionStatus } : {}),
    ...(typeof body.owner === "string" ? { owner: body.owner } : {}),
    ...(typeof body.due === "string" ? { due: body.due } : {}),
    ...(typeof body.note === "string" ? { note: body.note } : {}),
    ...(typeof body.title === "string" ? { title: body.title } : {}),
  });
  if (!updated) return NextResponse.json({ error: "항목이 없습니다." }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 가 없습니다." }, { status: 400 });
  return deleteAction(id)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "항목이 없습니다." }, { status: 404 });
}
