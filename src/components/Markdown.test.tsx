/**
 * The table bug shipped silently — the stylesheet had `th`/`td` rules for
 * months and nothing ever matched them, because the plugin that parses tables
 * was never installed. Nothing failed; answers just came back as rows of pipe
 * characters. A rendering test is the only thing that would have caught it.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Markdown from "./Markdown";

const render = (md: string) => renderToStaticMarkup(<Markdown>{md}</Markdown>);

const PROFILE = `## 접점

| 역할 | 이름·직책 | 결정하는 것 |
|---|---|---|
| 구매 | 미확인 | 미확인 |
| 개발·설계 | 박수석 | 사양 승인 |
`;

describe("Markdown", () => {
  it("renders a GFM table as a table", () => {
    const html = render(PROFILE);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>역할</th>");
    expect(html).toContain("<td>박수석</td>");
    // The pipes must be gone: their survival is what the bug looked like.
    expect(html).not.toContain("|---|");
  });

  it("marks a cell that is entirely 미확인, so the gaps can be counted", () => {
    const html = render(PROFILE);
    expect(html).toContain('<td data-unknown="true">미확인</td>');
    expect(html).toContain("<td>사양 승인</td>");
  });

  it("leaves prose that merely mentions 미확인 unmarked", () => {
    // A sentence is prose. Only a cell standing in for a value is a gap.
    const html = render("| 항목 |\n|---|\n| 결재선은 미확인 상태입니다 |\n");
    expect(html).not.toContain("data-unknown");
  });

  it("treats the other placeholders the playbooks use the same way", () => {
    const html = render("| a | b | c |\n|---|---|---|\n| 확인 필요 | 미정 | 3,000개 |\n");
    expect(html.match(/data-unknown/g)).toHaveLength(2);
  });

  it("still renders the headings and lists an answer ends with", () => {
    const html = render("## 다음 액션\n\n- 결재선 확인\n- 단가표 점검\n");
    expect(html).toContain("<h2>다음 액션</h2>");
    expect(html).toContain("<li>결재선 확인</li>");
  });

  it("does not leak react-markdown's node handle into the DOM", () => {
    // It arrives as a prop and serialises to node="[object Object]" if the
    // cell renderer spreads it. Nothing fails when it does; the attribute just
    // ships. Only reading the output catches this class of mistake.
    expect(render(PROFILE)).not.toContain("node=");
  });

  it("renders the text as written and never rewrites it", () => {
    // The verification panel is run against the same string. If rendering
    // altered it, the panel would be reporting on a different document.
    const html = render("일 배상률 **2.5%** 적용");
    expect(html).toContain("2.5%");
    expect(html).toContain("일 배상률");
  });
});
