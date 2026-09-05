import { NextResponse } from "next/server";
import { collectStoreStatus } from "@/lib/store-status";
import { summarise } from "@/lib/actions";

/**
 * What is on disk and whether it can be trusted.
 *
 * The action count comes from `summarise()` rather than from a file size,
 * because "the database is 40KB" answers nothing anyone asks. The row count is
 * what tells you whether the store is being used.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let rows: number | null = null;
  try {
    rows = summarise().total;
  } catch {
    // A database that will not open is worth reporting as unknown rather than
    // as zero — zero reads as "nothing captured yet", which is a different
    // situation with a different response.
    rows = null;
  }
  return NextResponse.json(await collectStoreStatus(rows));
}
