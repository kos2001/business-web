import { NextResponse } from "next/server";
import { describeConfig, ObsidianError, saveNote } from "@/lib/obsidian";
import { assertInsideRoot } from "@/lib/staging";

/**
 * Saves one answer into the Obsidian vault.
 *
 * `sources` come from the browser, so they go through the staging-root check
 * before being named in the note — not to read them (they are only rendered as
 * wikilinks), but because a path the server echoes into a file is still a path
 * the browser chose.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(describeConfig());
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").trim();
  const workspace = String(body.workspace ?? "").trim();
  if (!title || !text) {
    return NextResponse.json({ error: "제목과 본문이 필요합니다." }, { status: 400 });
  }

  const sources = Array.isArray(body.sources)
    ? body.sources.filter((p): p is string => {
        if (typeof p !== "string") return false;
        try {
          assertInsideRoot(p);
          return true;
        } catch {
          return false;
        }
      })
    : [];

  try {
    const saved = await saveNote({ title, workspace, body: text, sources });
    return NextResponse.json({ ok: true, name: saved.name, path: saved.path });
  } catch (err) {
    if (err instanceof ObsidianError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "노트를 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
