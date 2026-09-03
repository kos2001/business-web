/**
 * Recently opened workspaces, per browser.
 *
 * The home board already read this list, but nothing ever wrote it — the key
 * appeared once, in a `localStorage.getItem`, and the "recent" row was
 * therefore always empty. Recording the visit lives here rather than in the
 * home board because the visit happens in the workspace, and because the
 * sidebar wants the same list.
 *
 * Per browser on purpose: which workspaces you personally keep returning to is
 * a convenience, not shared state, and it is not worth a server round trip. It
 * comes back empty in a private window or on another machine, which is fine —
 * the nav still lists everything.
 */

const KEY = "business-web:recents";
const LIMIT = 8;

/** Newest first. Empty when unavailable, never throws. */
export function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string").slice(0, LIMIT)
      : [];
  } catch {
    // Private windows and blocked site data both throw on access rather than
    // returning null, so the read has to be guarded, not just null-checked.
    return [];
  }
}

/** Moves `slug` to the front. Returns the new list so callers can render it. */
export function recordVisit(slug: string): string[] {
  const next = [slug, ...readRecents().filter((s) => s !== slug)].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the list is a convenience, not state we need */
  }
  return next;
}
