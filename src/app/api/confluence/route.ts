import { NextResponse } from "next/server";
import { ConfluenceError, describeConfig, fetchPage } from "@/lib/confluence";
import { stageUpload, StagingError } from "@/lib/staging";

/**
 * Adds a Confluence page as if it had been uploaded.
 *
 * The response is deliberately the same shape as `/api/upload`: name, path,
 * bytes, sha256. Everything downstream — the attachment chip, the prompt that
 * names the path, `read_file` on the agent side, the source check that compares
 * quotations against the document — then works with no idea that this one came
 * off a wiki. A second parallel path for "documents that are pages" would be a
 * second place for every one of those to be got wrong.
 *
 * The page is written as text rather than parsed by docparser: it never was a
 * PDF, and `storageToText` already keeps the tables. Sending it through a
 * converter would be a round trip that can only lose things.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // The composer asks before offering the control, so a missing configuration
  // reads as "not set up here" rather than as a failure when clicked. The
  // settings page reads the same endpoint for its status block — which fields
  // are present, never their contents.
  return NextResponse.json(describeConfig());
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "default";
  if (!url) {
    return NextResponse.json({ error: "페이지 주소가 없습니다." }, { status: 400 });
  }

  try {
    const page = await fetchPage(url);
    // The title becomes the filename, so it goes through the same sanitiser as
    // an uploaded name — a page called "../../etc/passwd" is a page someone can
    // create.
    const staged = await stageUpload(
      sessionId,
      `${page.title}.md`,
      new TextEncoder().encode(
        // The provenance line is part of the document on purpose: a review that
        // quotes this text should be able to say where it came from, and the
        // agent only sees the file.
        `<!-- Confluence: ${page.url} -->\n\n# ${page.title}\n\n${page.text}\n`,
      ),
    );
    return NextResponse.json({ ...staged, parsed: true, source: page.url });
  } catch (err) {
    if (err instanceof ConfluenceError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof StagingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "페이지를 가져오지 못했습니다." },
      { status: 500 },
    );
  }
}
