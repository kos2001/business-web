/**
 * Deciding whether a workspace's playbooks are actually reachable.
 *
 * Split out of the `/api/agents` route so the rule is testable without a live
 * gateway. The rule is small but its three cases are easy to conflate, and
 * conflating them is what let 33 missing playbooks look healthy for a while.
 */

/**
 * Which of `playbooks` the agent cannot see.
 *
 * Returns `undefined` — not `[]` — when the skill list could not be read. The
 * caller has to be able to tell "nothing is missing" from "I could not check",
 * because rendering the second as the first is how a broken install goes
 * unnoticed.
 */
export function missingPlaybooks(
  playbooks: readonly string[],
  installed: Set<string> | undefined,
): string[] | undefined {
  if (playbooks.length === 0) return [];
  if (!installed) return undefined;
  return playbooks.filter((p) => !installed.has(p));
}

/**
 * The status a workspace should display.
 *
 * A reachable upstream with missing playbooks is "degraded", never "ok": the
 * agent answers from its persona instead of the playbook, which reads as the
 * model having an off day rather than as a broken install.
 */
export function workspaceState(
  backendStatus: string,
  missing: string[] | undefined,
): "ok" | "degraded" | string {
  if (backendStatus !== "ok") return backendStatus;
  return missing && missing.length > 0 ? "degraded" : "ok";
}
