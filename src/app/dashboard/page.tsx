import { AGENTS } from "@/lib/agents";
import Dashboard from "@/components/Dashboard";
import AppShell from "@/components/AppShell";

/**
 * The follow-up view. A thin server component that hands over the roster; the
 * items themselves are client state because they change as the user works
 * through them.
 */
export default function Page() {
  const nav = AGENTS.map((a) => ({ slug: a.slug, label: a.label, stage: a.stage }));
  return (
    <AppShell nav={nav} health={{}}>
      <Dashboard workspaces={nav} />
    </AppShell>
  );
}
