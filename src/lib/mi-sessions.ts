/**
 * Maps a business-web workspace session to the mi-report session it created.
 *
 * mi-report issues its own session ids (`mi-agent-<hex>`) and validates
 * ownership: `POST /agent/chat/stream` with a `sessionId` that user does not own
 * returns 404 before the agent ever runs. Forwarding this app's session id
 * therefore fails every request — which is exactly what happened the first time
 * the proxy was wired up.
 *
 * So the first turn sends no session id, and the `done` frame comes back with
 * the one mi-report minted. That id is remembered here and sent on later turns,
 * which is what makes the MI workspace multi-turn.
 *
 * In-memory and single-instance, same caveat as pending-runs.ts. Losing the map
 * costs conversation continuity, not correctness — the next turn simply starts
 * a fresh mi-report session.
 */

const TTL_MS = 12 * 60 * 60 * 1000;

interface Entry {
  miSessionId: string;
  touchedAt: number;
}

const sessions = new Map<string, Entry>();

export function rememberMiSession(clientSessionId: string, miSessionId: string): void {
  if (!clientSessionId || !miSessionId) return;
  sweep();
  sessions.set(clientSessionId, { miSessionId, touchedAt: Date.now() });
}

export function lookupMiSession(clientSessionId?: string): string | undefined {
  if (!clientSessionId) return undefined;
  const found = sessions.get(clientSessionId);
  if (!found) return undefined;
  found.touchedAt = Date.now();
  return found.miSessionId;
}

/** Called when the user starts a new conversation in the workspace. */
export function forgetMiSession(clientSessionId: string): void {
  sessions.delete(clientSessionId);
}

function sweep(now = Date.now()): void {
  for (const [key, entry] of sessions) {
    if (now - entry.touchedAt > TTL_MS) sessions.delete(key);
  }
}
