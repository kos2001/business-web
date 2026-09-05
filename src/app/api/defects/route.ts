import { NextResponse } from "next/server";
import { recurringPatterns, summariseDefects } from "@/lib/defects";

/**
 * What the checks keep finding, grouped.
 *
 * The window is a query parameter because the useful question changes: "what is
 * broken now" is a week, "did that rule work" is a quarter.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const raw = Number(new URL(req.url).searchParams.get("days") ?? 30);
  const days = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 365) : 30;
  try {
    return NextResponse.json({
      days,
      patterns: recurringPatterns(days),
      summary: summariseDefects(days),
    });
  } catch {
    // An unreadable store must not read as "no defects" — that is the most
    // reassuring possible lie.
    return NextResponse.json({ error: "결함 기록을 읽지 못했습니다." }, { status: 500 });
  }
}
