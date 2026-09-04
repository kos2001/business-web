import { NextResponse } from "next/server";
import {
  corpusAvailable,
  corpusDocuments,
  corpusIndexed,
  ingestDocument,
  searchCorpus,
} from "@/lib/corpus";

export const dynamic = "force-dynamic";

/** What the corpus currently holds, so the UI can say so rather than guess. */
export async function GET() {
  return NextResponse.json({
    available: corpusAvailable(),
    indexed: corpusIndexed(),
    documents: await corpusDocuments(),
  });
}

interface Body {
  /** "search" queries the corpus; "ingest" adds a staged upload to it. */
  action?: "search" | "ingest";
  query?: string;
  topK?: number;
  path?: string;
  name?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!corpusAvailable()) {
    return NextResponse.json(
      { error: "docparser가 설치되어 있지 않습니다." },
      { status: 503 },
    );
  }

  if (body.action === "ingest") {
    const path = String(body.path ?? "");
    const name = String(body.name ?? "");
    // Only files this app staged may be ingested. Without this the endpoint
    // would copy any server path into a directory the agent reads, which is a
    // read-anything primitive dressed up as an upload.
    if (!path.includes("business-web-staging/") || !name) {
      return NextResponse.json(
        { error: "업로드된 파일만 코퍼스에 추가할 수 있습니다." },
        { status: 400 },
      );
    }
    const result = await ingestDocument(path, name);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  const query = String(body.query ?? "").trim();
  if (!query) return NextResponse.json({ error: "검색어가 없습니다." }, { status: 400 });
  if (!corpusIndexed()) {
    return NextResponse.json({
      hits: [],
      note: "아직 색인된 계약서가 없습니다. 계약서를 먼저 코퍼스에 추가하세요.",
    });
  }

  return NextResponse.json({
    hits: await searchCorpus(query, Math.min(Math.max(body.topK ?? 5, 1), 20)),
  });
}
