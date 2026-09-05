/**
 * Where the global controls live.
 *
 * These moved several times — the settings pages from the sidebar foot to an
 * icon row to the page corner, then 다음 액션 after them, then the fold toggle
 * and 새 대화 시작 from the foot to the header. Each move left the previous
 * arrangement half in place somewhere: a link duplicated in the collapsed rail,
 * a fetch kept alive for a dot that had moved. Position is the thing being
 * asserted here, because position is what kept drifting.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Sidebar from "./Sidebar";
import { UTILITIES } from "./utilities";

const sidebar = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <Sidebar nav={[]} health={{}} onToggleCollapsed={() => {}} onReset={() => {}} {...props} />,
  );

describe("global pages", () => {
  it("keeps every page that belongs to no workspace in one row", () => {
    expect(UTILITIES.map((u) => u.label)).toEqual([
      "다음 액션",
      "반복되는 결함",
      "문서와 저장소",
      "접근 권한 설정",
      "Confluence 연결",
      "Obsidian 노트",
    ]);
  });

  it("puts 다음 액션 first, as the one opened daily", () => {
    expect(UTILITIES[0].href).toBe("/dashboard");
  });

  it("gives every one an icon and a distinct destination", () => {
    expect(UTILITIES.every((u) => u.path.length > 0)).toBe(true);
    expect(new Set(UTILITIES.map((u) => u.href)).size).toBe(UTILITIES.length);
  });
});

describe("sidebar", () => {
  it("puts the fold toggle in the header, above the workspace list", () => {
    const html = sidebar();
    expect(html.indexOf('aria-label="사이드바 접기"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-label="사이드바 접기"')).toBeLessThan(html.indexOf("<nav"));
  });

  it("puts 새 대화 시작 above the workspace list too", () => {
    const html = sidebar();
    expect(html.indexOf("새 대화 시작")).toBeLessThan(html.indexOf("<nav"));
  });

  it("no longer carries the global pages — they would be a second copy of the corner row", () => {
    const html = sidebar();
    for (const u of UTILITIES) expect(html).not.toContain(`href="${u.href}"`);
  });

  it("says fold or unfold according to which state it is in", () => {
    expect(sidebar({ collapsed: true })).toContain('aria-label="사이드바 펼치기"');
    expect(sidebar({ collapsed: true })).toContain('aria-expanded="false"');
  });

  it("omits the toggle entirely when the shell cannot fold", () => {
    const html = renderToStaticMarkup(<Sidebar nav={[]} health={{}} />);
    expect(html).not.toContain("사이드바 접기");
    expect(html).not.toContain("새 대화 시작");
  });
});
