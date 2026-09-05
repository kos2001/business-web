import { AGENTS } from "@/lib/agents";
import AppShell from "@/components/AppShell";
import StoreStatusView from "@/components/StoreStatus";

export const dynamic = "force-dynamic";

export default function Page() {
  const nav = AGENTS.map((a) => ({ slug: a.slug, label: a.label, stage: a.stage }));
  return (
    <AppShell nav={nav} health={{}}>
      <StoreStatusView />
    </AppShell>
  );
}
