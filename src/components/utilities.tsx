/**
 * The pages that are about the system rather than about the work.
 *
 * They have moved twice: from a stack of text links at the bottom of the
 * sidebar, to an icon row at its top, to the top-right of the page. The last
 * move is the one that fits — the sidebar is a narrow column already holding
 * seven domains and twenty-five workspaces, while the header band has an empty
 * right half on every page.
 *
 * Defined here rather than in either component because three places render
 * them now (the page corner, the collapsed rail, the narrow-screen bar) and a
 * fourth icon added to only two of them is the kind of drift nobody notices.
 */

export interface Utility {
  href: string;
  label: string;
  /** SVG path for a 16×16 stroked icon. */
  path: string;
}

export const UTILITIES: readonly Utility[] = [
  {
    href: "/improvement",
    label: "반복되는 결함",
    // An arrow returning on itself — something that keeps coming back.
    path: "M3 8a5 5 0 0 1 8.5-3.5L13 6M13 8a5 5 0 0 1-8.5 3.5L3 10M13 3v3h-3M3 13v-3h3",
  },
  {
    href: "/stores",
    label: "문서와 저장소",
    // Stacked discs — what is held.
    path: "M8 2.5c2.8 0 5 .7 5 1.6S10.8 5.7 8 5.7 3 5 3 4.1s2.2-1.6 5-1.6zM3 4.1v3.8c0 .9 2.2 1.6 5 1.6s5-.7 5-1.6V4.1M3 7.9v3.8c0 .9 2.2 1.6 5 1.6s5-.7 5-1.6V7.9",
  },
  {
    href: "/settings/access",
    label: "접근 권한 설정",
    path: "M9.5 6.5a2.5 2.5 0 1 1-1.9 4.1L3 15.2 2 14.2l.8-.8-.9-.9.9-.9-.9-.9L6.4 6.4A2.5 2.5 0 0 1 9.5 3.9",
  },
  {
    href: "/settings/confluence",
    label: "Confluence 연결",
    path: "M6.5 9.5a3 3 0 0 0 4.24 0l2-2a3 3 0 0 0-4.24-4.24l-.7.7M9.5 6.5a3 3 0 0 0-4.24 0l-2 2a3 3 0 0 0 4.24 4.24l.7-.7",
  },
  {
    href: "/settings/obsidian",
    label: "Obsidian 노트",
    path: "M9.5 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V5.5L9.5 2zM9.5 2v3.5H13M5.5 8.5h5M5.5 11h3",
  },
] as const;

export function UtilityIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden>
      <path d={path} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
