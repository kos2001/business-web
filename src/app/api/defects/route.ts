import { NextResponse } from "next/server";
import { defectsInPattern, recurringPatterns, summariseDefects } from "@/lib/defects";

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
  const key = new URL(req.url).searchParams.get("key");
  try {
    // Asking for one pattern's records: the list is opened per card, so it is
    // fetched per card rather than shipping every occurrence with the page.
    if (key) {
      return NextResponse.json({ days, key, occurrences: defectsInPattern(key, days) });
    }
    return NextResponse.json({
      days,
      patterns: recurringPatterns(days),
      // Everything, grouped the same way but without the recurrence threshold.
      // The page needs these to answer "what are the fourteen?" — a count the
      // reader cannot open is not evidence, and one-offs are still where a
      // pattern starts. Same grouping so a defect does not change identity when
      // it crosses from one list to the other.
      groups: recurringPatterns(days, 1),
      summary: summariseDefects(days),
    });
  } catch {
    // An unreadable store must not read as "no defects" — that is the most
    // reassuring possible lie.
    return NextResponse.json({ error: "결함 기록을 읽지 못했습니다." }, { status: 500 });
  }
}
