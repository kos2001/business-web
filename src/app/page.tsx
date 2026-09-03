import { Suspense } from "react";
import { AGENTS } from "@/lib/agents";
import Home from "@/components/Home";

/**
 * This route used to `redirect()` into the first workspace, which left the app
 * with no way to show what it can do. It is now the home board — see Home.tsx
 * for what it is and why. Everything on it needs client state (search, recents,
 * live health), so this stays a thin server component that only hands over the
 * roster.
 */
export default function Page() {
  // Home reads `?stage=` (the workspace breadcrumb links back with it), and
  // Next requires a boundary around useSearchParams on a statically generated
  // route — same reason /w/[agent] has one.
  return (
    <Suspense>
      <Home
        agents={AGENTS.map((a) => ({
          slug: a.slug,
          label: a.label,
          blurb: a.blurb,
          stage: a.stage,
          starters: a.starters,
          playbooks: a.playbooks,
        }))}
      />
    </Suspense>
  );
}
