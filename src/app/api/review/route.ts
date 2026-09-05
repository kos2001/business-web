import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { reviewAnswer } from "@/lib/answer-review";
import { recordDefect, type DefectKind } from "@/lib/defects";
import { assertInsideRoot } from "@/lib/staging";

/**
 * Verification for one finished answer.
 *
 * Runs after the answer is on screen rather than before, on purpose. The
 * mechanical checks are instant but the review pass is a second model call, and
 * holding a contract review back for it would trade a visible problem for a
 * blank screen. The answer appears, then the verdict lands under it.
 */
export const dynamic = "force-dynamic";

/** Long enough for the contract, short enough not to blow out the review turn. */
const MAX_SOURCE_CHARS = 60_000;

/**
 * Loads the parsed documents the answer was about.
 *
 * `assertInsideRoot` is the whole security story here: the browser supplies
 * these paths, so without it this route reads any file the server can — the
 * same primitive the corpus ingest had to be closed against. A path that fails
 * is skipped rather than rejected, because a review that runs on the documents
 * it could read is more useful than one that refuses over a stale path.
 */
async function loadSources(paths: unknown): Promise<string> {
  if (!Array.isArray(paths)) return "";
  const chunks: string[] = [];
  for (const p of paths.slice(0, 8)) {
    if (typeof p !== "string") continue;
    try {
      assertInsideRoot(p);
      chunks.push(await readFile(p, "utf8"));
    } catch {
      continue;
    }
  }
  return chunks.join("\n\n").slice(0, MAX_SOURCE_CHARS);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const answer = typeof body.answer === "string" ? body.answer : "";
  if (!answer.trim()) {
    return NextResponse.json({ error: "answer 가 없습니다." }, { status: 400 });
  }

  const source = await loadSources(body.sourcePaths);
  const review = await reviewAnswer(answer, source || undefined);

  // Record what was found before returning it. Until now every defect was shown
  // once and forgotten, so nobody could tell a one-off from a habit — and that
  // is the only distinction that matters, because a habit is an instruction
  // problem and instructions are fixable. See lib/defects.ts.
  const workspace = typeof body.workspace === "string" ? body.workspace : "";
  if (workspace) {
    const found: { kind: DefectKind; quote: string; reason: string }[] = [
      ...review.findings.map((f) => ({
        kind: f.kind as DefectKind,
        quote: f.quote,
        reason: f.reason,
      })),
      // A 률/율 slip is a misspelling, not corruption, and it has to reach the
      // store as one: the seeded 배상율 records and anything the reviewer model
      // catches are already `spelling`, and grouping keys off the change rather
      // than the sentence. Recording it under its own kind would split one
      // habit into two patterns and the loop would never see it recur.
      ...review.mechanical.map((m) =>
        m.correction
          ? {
              kind: "spelling" as DefectKind,
              quote: m.correction.wrong,
              reason: `'${m.correction.right}'의 오타입니다.`,
            }
          : { kind: m.kind as DefectKind, quote: m.evidence, reason: m.label },
      ),
      ...review.source
        .filter((x) => x.kind === "misquote")
        .map((x) => ({ kind: "misquote" as DefectKind, quote: x.evidence, reason: x.label })),
    ];
    for (const d of found) {
      try {
        recordDefect({ workspace, ...d });
      } catch {
        // Recording is bookkeeping. A failure here must not take down the
        // verdict the reader is waiting for.
      }
    }
  }

  return NextResponse.json(review);
}
