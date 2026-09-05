/**
 * The playbook manifest — every skill the `sales-agent` hermes profile carries.
 *
 * ## Why this file exists
 *
 * The playbooks themselves do not live here. They are Markdown files seeded
 * into `~/.hermes/<profile>/skills/sales/` by sales-agent-desktop
 * (`src/main/sales-harness.ts`, versioned by `SALES_HARNESS_VERSION`). This app
 * only *names* them, in the `instructions` field of each workspace.
 *
 * That makes the coupling invisible: a renamed or dropped playbook does not
 * break a build or throw at runtime. The agent simply cannot find the skill and
 * answers from its persona instead — a quiet quality regression that looks like
 * the model having an off day. So the names are listed here once, and
 * `agents.test.ts` asserts that every name a workspace reaches for is in this
 * list and that every playbook in this list is reachable from some workspace.
 * A drift on either side fails a test instead of failing silently.
 *
 * ## Keeping it in sync
 *
 * This list mirrors `REFERENCED_PLAYBOOKS` in the desktop app's
 * `src/shared/sales-persona.ts`. When the desktop bundle gains or renames a
 * skill, update this file and the roster in the same change.
 *
 * The grouping below is the sales team's own taxonomy, taken from the persona's
 * playbook table rather than invented here. `agents.ts` orders the nav by it.
 */

/**
 * Applies to every task, so it belongs to no single workspace: any work where a
 * customer's information appears at all is governed by it. The profile's
 * SOUL.md already says so; workspaces do not need to repeat it.
 */
export const ALWAYS_ON_PLAYBOOK = "customer-data-handling";

/** Playbooks by the domain of work they serve. Order is the nav order. */
export const PLAYBOOKS_BY_DOMAIN = {
  "시장·사업 동향": ["market-trend-brief", "market-sizing", "account-brief"],
  판매전략: [
    "sales-target-setting",
    "sales-plan",
    "sales-execution-tracking",
    "pricing-strategy",
    "markup-policy",
    "sales-meeting-report",
  ],
  "신규수요 창출": [
    "demand-generation",
    "territory-prospecting",
    "sales-code-registration",
    "promotion-program",
    "design-win-management",
    "competitive-conversion",
    "sample-management",
  ],
  "딜 진행": [
    "discovery-notes",
    "deal-qualification",
    "followup-email",
    "proposal-outline",
    "competitive-battlecard",
    "objection-handling",
    "deal-risk-review",
    "pipeline-hygiene",
  ],
  계약: [
    "contract-review",
    "contract-countermeasure",
    "contract-drafting",
    "contract-operations",
    "contract-diff",
    "contract-legal-brief",
  ],
  "물량·재고 운영": [
    "strategic-volume-ops",
    "supply-allocation",
    "inventory-management",
    "logistics-support",
  ],
  "품질 관리": ["rma-handling", "eol-management", "pcn-management"],
  "고객 관리": [
    "customer-profile",
    "customer-visit-hosting",
    "qbr-review",
    "business-courtesy",
    "global-account-management",
    "overseas-operations",
  ],
} as const satisfies Record<string, readonly string[]>;

/** Every playbook a workspace may name, flattened. */
export const PLAYBOOKS: readonly string[] = Object.values(
  PLAYBOOKS_BY_DOMAIN,
).flat();
