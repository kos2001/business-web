import { describe, expect, it } from "vitest";
import { pageIdFrom, storageToText, ConfluenceError } from "./confluence";

/**
 * `CONFLUENCE_BASE_URL` is set in `vitest.config.ts` so the host check has
 * something to check against. `fetchPage` is not tested here — it needs a live
 * site, and what can go wrong without one is the parsing, which is all here.
 */
const SITE = "https://acme.atlassian.net/wiki";

describe("pageIdFrom", () => {
  it("takes a bare id", () => {
    expect(pageIdFrom("123456789")).toBe("123456789");
  });

  it("reads the id out of a full page URL", () => {
    expect(pageIdFrom(`${SITE}/spaces/SALES/pages/123456789/A사+공급계약`)).toBe("123456789");
  });

  it("reads a URL with no title segment", () => {
    expect(pageIdFrom(`${SITE}/spaces/SALES/pages/123456789`)).toBe("123456789");
  });

  it("reads the legacy viewpage query form", () => {
    expect(pageIdFrom("https://acme.atlassian.net/pages/viewpage.action?pageId=987")).toBe("987");
  });

  it("refuses another host outright", () => {
    expect(() => pageIdFrom("https://evil.example.com/wiki/pages/1")).toThrow(ConfluenceError);
  });

  it("refuses a host that merely ends with the configured one", () => {
    // The check that catches this is equality; "endsWith" would pass it, and
    // this is the shape an attacker actually registers.
    expect(() => pageIdFrom("https://notacme.atlassian.net/wiki/pages/1")).toThrow(
      ConfluenceError,
    );
  });

  it("refuses a host that merely contains the configured one", () => {
    expect(() => pageIdFrom("https://acme.atlassian.net.evil.com/wiki/pages/1")).toThrow(
      ConfluenceError,
    );
  });

  it("explains the short-link case instead of following it", () => {
    expect(() => pageIdFrom(`${SITE}/x/AbCdEf`)).toThrow(/짧은 링크/);
  });

  it("rejects text that is not a URL or an id", () => {
    expect(() => pageIdFrom("우리 위키의 계약서 페이지")).toThrow(ConfluenceError);
  });

  it("rejects a same-host URL with no page id in it", () => {
    expect(() => pageIdFrom(`${SITE}/spaces/SALES/overview`)).toThrow(ConfluenceError);
  });
});

describe("storageToText", () => {
  it("keeps table rows as pipe-separated lines", () => {
    // The 품목표 is the reason this function exists: losing it loses the 단가.
    const xhtml =
      "<table><tbody>" +
      "<tr><th>품목</th><th>단가</th><th>월 최소물량</th></tr>" +
      "<tr><td>SEM-A100</td><td>14,200원</td><td>8,000개</td></tr>" +
      "</tbody></table>";
    const out = storageToText(xhtml);
    expect(out).toContain("| 품목 | 단가 | 월 최소물량 |");
    expect(out).toContain("| SEM-A100 | 14,200원 | 8,000개 |");
  });

  it("keeps paragraphs on separate lines", () => {
    expect(storageToText("<p>제4조 검수</p><p>제5조 지연배상</p>")).toBe(
      "제4조 검수\n제5조 지연배상",
    );
  });

  it("turns list items into dashes", () => {
    expect(storageToText("<ul><li>해지</li><li>배상</li></ul>")).toBe("- 해지\n- 배상");
  });

  it("unescapes the entities Confluence writes", () => {
    expect(storageToText("<p>갑 &amp; 을 &quot;계약&quot; &lt;조항&gt;</p>")).toBe(
      '갑 & 을 "계약" <조항>',
    );
  });

  it("drops macro plumbing but keeps the body inside it", () => {
    const xhtml =
      '<ac:structured-macro ac:name="info">' +
      '<ac:parameter ac:name="title">참고</ac:parameter>' +
      "<ac:rich-text-body><p>배상 상한 없음</p></ac:rich-text-body>" +
      "</ac:structured-macro>";
    expect(storageToText(xhtml)).toBe("배상 상한 없음");
  });

  it("collapses runs of blank lines", () => {
    expect(storageToText("<p>가</p><p></p><p></p><p>나</p>")).toBe("가\n\n나");
  });

  it("returns empty for an empty page rather than whitespace", () => {
    expect(storageToText("<p></p>")).toBe("");
  });
});
