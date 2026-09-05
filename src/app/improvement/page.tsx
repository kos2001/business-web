import { AGENTS } from "@/lib/agents";
import Sidebar from "@/components/Sidebar";
import Improvement from "@/components/Improvement";

export const dynamic = "force-dynamic";

export default function Page() {
  const nav = AGENTS.map((a) => ({ slug: a.slug, label: a.label, stage: a.stage }));
  return (
    <div className="flex h-dvh">
      <Sidebar nav={nav} health={{}} />
      <Improvement />
    </div>
  );
}
