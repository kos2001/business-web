import { notFound } from "next/navigation";
import { AGENTS, STAGES, type Stage } from "@/lib/agents";
import Sidebar from "@/components/Sidebar";
import StageDashboard from "@/components/StageDashboard";

/**
 * One dashboard per work domain.
 *
 * The stage name is the URL segment rather than a slug, so /dashboard/계약 is
 * the address. It is what the nav, the breadcrumb and the roster already call
 * this domain, and inventing a second identifier for it would mean a mapping
 * table that only exists to be kept in sync.
 */
export function generateStaticParams() {
  return STAGES.map((stage) => ({ stage: encodeURIComponent(stage) }));
}

export default async function Page({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: raw } = await params;
  const stage = decodeURIComponent(raw);
  if (!(STAGES as readonly string[]).includes(stage)) notFound();

  const nav = AGENTS.map((a) => ({ slug: a.slug, label: a.label, stage: a.stage }));
  const workspaces = AGENTS.filter((a) => a.stage === stage).map((a) => ({
    slug: a.slug,
    label: a.label,
    stage: a.stage,
    blurb: a.blurb,
  }));

  return (
    <div className="flex h-dvh">
      <Sidebar nav={nav} health={{}} />
      <StageDashboard stage={stage as Stage} workspaces={workspaces} />
    </div>
  );
}
