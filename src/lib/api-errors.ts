import { NextResponse } from "next/server";
import { HermesError } from "./hermes";

/**
 * Turns a thrown gateway failure into a JSON response.
 *
 * Lives here rather than in a route module because Next only permits HTTP
 * method exports from a `route.ts` — anything else fails the build with
 * "is not a valid Route export field".
 */
export function errorResponse(err: unknown) {
  if (err instanceof HermesError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 500 });
}
