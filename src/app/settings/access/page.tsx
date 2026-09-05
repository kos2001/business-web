import { AGENTS } from "@/lib/agents";
import AppShell from "@/components/AppShell";
import AccessSettings from "@/components/AccessSettings";

/**
 * Wrapped in the same shell as every other page. It used to render bare —
 * no sidebar, no banded header, a smaller heading — which made the one screen
 * about who may enter the app look like it belonged to a different one.
 */
export const dynamic = "force-dynamic";

export default function AccessSettingsPage() {
  const nav = AGENTS.map((a) => ({ slug: a.slug, label: a.label, stage: a.stage }));
  return (
    <AppShell nav={nav} health={{}}>
      <AccessSettings />
    </AppShell>
  );
}
