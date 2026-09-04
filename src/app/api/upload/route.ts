import { NextResponse } from "next/server";
import { extractTables, parseToMarkdown } from "@/lib/docparse";
import { extensionOf, MAX_FILE_BYTES, StagingError, stageUpload } from "@/lib/staging";

export const dynamic = "force-dynamic";

/**
 * Accepts a document and stages it where the agent can read it.
 *
 * The response returns the absolute staged path because the browser needs it to
 * build the next prompt ("<path> 파일을 분석해 줘"). It is a path on the server's
 * own disk, inside a directory this app created — not a capability the browser
 * did not already have through the run API.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "multipart/form-data가 필요합니다." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const sessionId = String(form.get("sessionId") ?? "default");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드가 없습니다." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "파일이 너무 큽니다." }, { status: 413 });
  }

  try {
    const staged = await stageUpload(
      sessionId,
      file.name,
      new Uint8Array(await file.arrayBuffer()),
    );

    // Parse here rather than leaving it to the agent: this hermes build has no
    // MCP, so docparser's tools never reach it. See src/lib/docparse.ts.
    const ext = extensionOf(staged.name);
    const [parse, tables] = await Promise.all([
      parseToMarkdown(staged.path, ext),
      extractTables(staged.path),
    ]);

    return NextResponse.json({
      ...staged,
      path: parse.path,
      parsed: parse.parsed,
      ...(tables ? { extraPaths: [tables] } : {}),
      ...(parse.note ? { note: parse.note } : {}),
    });
  } catch (err) {
    if (err instanceof StagingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "업로드에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
