import { AGENTS } from "@/lib/agents";
import AppShell from "@/components/AppShell";
import ConfluenceSettings from "@/components/ConfluenceSettings";

/**
 * Reads its status from the API rather than from the environment directly, so
 * the page and the composer are answering the same question with the same code
 * — a settings screen that says "connected" while the control stays hidden is
 * worse than no settings screen.
 */
export const dynamic = "force-dynamic";

export default function Page() {
  const nav = AGENTS.map((a) => ({ slug: a.slug, label: a.label, stage: a.stage }));
  return (
    <AppShell nav={nav} health={{}}>
      <ConfluenceSettings />
    </AppShell>
  );
}
