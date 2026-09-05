import { AGENTS } from "@/lib/agents";
import Dashboard from "@/components/Dashboard";
import Sidebar from "@/components/Sidebar";

/**
 * The follow-up view. A thin server component that hands over the roster; the
 * items themselves are client state because they change as the user works
 * through them.
 */
export default function Page() {
  const nav = AGENTS.map((a) => ({ slug: a.slug, label: a.label, stage: a.stage }));
  return (
    <div className="flex h-dvh">
      <Sidebar nav={nav} health={{}} />
      <Dashboard workspaces={nav} />
    </div>
  );
}
