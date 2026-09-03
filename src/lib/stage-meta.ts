/**
 * The visual system for the seven work domains.
 *
 * Twenty-three workspaces is more than anyone reads as a list. The team is
 * mostly non-developers, so the nav has to be *recognised* rather than read:
 * each domain gets one colour and one icon, used identically on the home board,
 * in the sidebar, and in the workspace header. Colour is the constant that lets
 * someone learn "물량은 청록색" once and then find it by shape and hue.
 *
 * Colours are hex here rather than Tailwind class names on purpose: Tailwind v4
 * scans source text for class names, so a class assembled at runtime
 * (`bg-${color}-500`) is compiled away and silently renders unstyled. These are
 * handed to the DOM as inline custom properties, which cannot be purged.
 *
 * `what` is written for someone who has never opened the app: it says what the
 * domain is for in the team's own words, not what the software does.
 */

import type { Stage } from "./agents";

export interface StageMeta {
  /** Accent hue for the domain. Mid-weight so white text on it stays legible. */
  color: string;
  /** One plain sentence: what this group of work is. */
  what: string;
  /** SVG path(s) for a 24×24 stroked icon. */
  icon: string;
}

export const STAGE_META: Record<Stage, StageMeta> = {
  "시장·고객 조사": {
    color: "#4f46e5",
    what: "고객을 만나기 전에 알아야 할 것 — 시장이 어떻게 돌아가는지, 이 회사가 어떤 곳인지.",
    icon: "M20 20l-3.6-3.6M18 11a7 7 0 11-14 0 7 7 0 0114 0z",
  },
  판매전략: {
    color: "#2f5bd7",
    what: "얼마를 어떻게 팔지 정하고, 계획대로 가고 있는지 보고 보고하는 일.",
    icon: "M4 19V5M4 19h16M8 16V9M13 16v-4M18 16V6",
  },
  "신규수요 창출": {
    color: "#0f9b6c",
    what: "지금 거래처 말고 새로 팔 곳을 찾는 일 — 신규 고객, 새 용도, 설계 진입.",
    icon: "M12 8v8M8 12h8M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  "딜 진행": {
    color: "#c2790a",
    what: "미팅부터 제안·경쟁 대응까지, 건별로 딜을 밀고 나가는 일.",
    icon: "M3 17l6-6 4 4 8-8M21 7h-5M21 7v5",
  },
  계약: {
    color: "#c2410c",
    what: "계약서를 검토하고, 맺은 뒤에는 갱신과 이행을 놓치지 않게 관리하는 일.",
    icon: "M14 3v5h5M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM9 13h6M9 17h4",
  },
  "물량·품질 운영": {
    color: "#0e7490",
    what: "약속한 물건이 제때 제대로 나가게 하는 일 — 물량, 재고, 출하, 사고 대응.",
    icon: "M21 8l-9-5-9 5m18 0v8l-9 5-9-5V8m18 0l-9 5m0 0L3 8m9 5v9",
  },
  "고객 관리": {
    color: "#7c3aed",
    what: "이미 거래 중인 고객을 오래 끌고 가는 일 — 프로파일, 내방, 분기 리뷰.",
    icon: "M17 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9.5 6.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zM22 20v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  },
};
