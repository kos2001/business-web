/**
 * Reading a contract that lives on a Confluence page instead of a file.
 *
 * Plenty of contracts never arrive as a .docx. They are a wiki page someone
 * links in a thread, and until now the only way to review one was to copy it
 * into the box by hand, which loses the tables — the part a supply contract is
 * mostly made of.
 *
 * ## The security shape
 *
 * This takes a URL from the browser and fetches it server-side, which is an
 * SSRF primitive unless it is fenced. Two rules do the fencing:
 *
 * 1. **Only the configured site.** The host must equal `CONFLUENCE_BASE_URL`'s
 *    host. Not "ends with", not "contains" — `evil-example.com` contains
 *    `example.com`, and a suffix check passes `notexample.com`. Anything else
 *    is refused before a socket opens.
 * 2. **Only page reads.** The path is discarded; what is extracted is the page
 *    id, and the request is built from scratch against the REST API. A URL
 *    cannot smuggle a path, a port, or a query.
 *
 * The credentials never leave the server. They are read from the environment
 * here, in a module no client component can import without pulling `process.env`
 * into the bundle, which Next refuses — the same fence as `hermes.ts`.
 */

const BASE = process.env.CONFLUENCE_BASE_URL ?? "";
const EMAIL = process.env.CONFLUENCE_EMAIL ?? "";
const TOKEN = process.env.CONFLUENCE_API_TOKEN ?? "";

export class ConfluenceError extends Error {}

/** Whether the feature is usable at all, so the UI can say so up front. */
export function isConfigured(): boolean {
  return Boolean(BASE && EMAIL && TOKEN);
}

function baseUrl(): URL {
  try {
    return new URL(BASE);
  } catch {
    throw new ConfluenceError(
      "CONFLUENCE_BASE_URL 이 올바른 URL 이 아닙니다. 예: https://회사.atlassian.net/wiki",
    );
  }
}

/**
 * The page id from a Confluence URL.
 *
 * Confluence hands out several shapes for the same page and people paste
 * whichever one their browser had:
 *
 *   .../wiki/spaces/SALES/pages/123456789/A사+공급계약
 *   .../wiki/spaces/SALES/pages/123456789
 *   .../pages/viewpage.action?pageId=123456789
 *   .../wiki/x/AbCdEf                      ← short link, id not in the URL
 *
 * The first three are read directly. The short link is refused with an
 * explanation rather than followed: resolving it means chasing a redirect,
 * which is exactly the freedom the host check exists to remove.
 */
export function pageIdFrom(input: string): string {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ConfluenceError("Confluence 페이지 주소나 페이지 ID 를 넣어 주세요.");
  }

  const site = baseUrl();
  if (url.host !== site.host) {
    throw new ConfluenceError(
      `이 사이트의 페이지만 읽을 수 있습니다: ${site.host} (받은 주소: ${url.host})`,
    );
  }

  const byQuery = url.searchParams.get("pageId");
  if (byQuery && /^\d+$/.test(byQuery)) return byQuery;

  const byPath = /\/pages\/(\d+)/.exec(url.pathname);
  if (byPath) return byPath[1];

  if (/\/x\//.test(url.pathname)) {
    throw new ConfluenceError(
      "짧은 링크(/x/…)는 페이지 ID 를 알 수 없습니다. 페이지에서 전체 주소를 복사해 주세요.",
    );
  }
  throw new ConfluenceError("주소에서 페이지 ID 를 찾지 못했습니다.");
}

export interface ConfluencePage {
  id: string;
  title: string;
  /** Plain-ish text with tables preserved as pipe rows. */
  text: string;
  /** Where it came from, kept so a review can cite its source. */
  url: string;
}

/**
 * Confluence storage format is XHTML. This is not a general HTML-to-text pass —
 * it only has to survive one generator, and the one thing it must not lose is
 * table structure, since a 품목표 is where the 단가 and 월 최소물량 live.
 */
export function storageToText(xhtml: string): string {
  let s = xhtml;

  // Confluence wraps user content in macros; keep the body, drop the plumbing.
  s = s.replace(/<ac:parameter[^>]*>[\s\S]*?<\/ac:parameter>/g, "");
  s = s.replace(/<ri:[^>]*\/?>/g, "");
  s = s.replace(/<\/?ac:[^>]*>/g, "");

  // Tables first: cell and row boundaries have to become text before the tag
  // strip below removes them.
  s = s.replace(/<\/t[hd]>\s*<t[hd][^>]*>/g, " | ");
  s = s.replace(/<t[hd][^>]*>/g, "| ");
  s = s.replace(/<\/t[hd]>/g, " |");
  s = s.replace(/<\/tr>/g, "\n");
  s = s.replace(/<\/table>/g, "\n\n");

  s = s.replace(/<\/(p|div|h[1-6]|li|blockquote)>/g, "\n");
  s = s.replace(/<br\s*\/?>/g, "\n");
  s = s.replace(/<li[^>]*>/g, "- ");
  s = s.replace(/<[^>]+>/g, "");

  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));

  return s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchPage(input: string): Promise<ConfluencePage> {
  if (!isConfigured()) {
    throw new ConfluenceError(
      "Confluence 연결이 설정되지 않았습니다. .env.local 에 CONFLUENCE_BASE_URL, " +
        "CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN 을 넣어 주세요.",
    );
  }
  const id = pageIdFrom(input);
  const site = baseUrl();
  // Built from the configured origin, never from the pasted URL.
  const api = new URL(
    `${site.pathname.replace(/\/$/, "")}/rest/api/content/${id}?expand=body.storage`,
    site.origin,
  );

  const res = await fetch(api, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new ConfluenceError(
      "Confluence 인증에 실패했습니다. API 토큰과 이메일을 확인해 주세요.",
    );
  }
  if (res.status === 404) {
    throw new ConfluenceError(`페이지를 찾을 수 없습니다 (ID ${id}). 권한이 없을 수도 있습니다.`);
  }
  if (!res.ok) {
    throw new ConfluenceError(`Confluence 응답 오류 ${res.status}`);
  }

  const body = (await res.json()) as {
    id?: string;
    title?: string;
    body?: { storage?: { value?: string } };
  };
  const text = storageToText(body.body?.storage?.value ?? "");
  if (!text) {
    throw new ConfluenceError("페이지에 읽을 수 있는 본문이 없습니다.");
  }

  return {
    id: body.id ?? id,
    title: body.title ?? `confluence-${id}`,
    text,
    url: `${site.origin}${site.pathname.replace(/\/$/, "")}/pages/${id}`,
  };
}
