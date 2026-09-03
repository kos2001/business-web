import { notFound } from "next/navigation";
import { AGENTS, findAgent } from "@/lib/agents";
import Workspace from "@/components/Workspace";

export function generateStaticParams() {
  return AGENTS.map((a) => ({ agent: a.slug }));
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  const { agent: slug } = await params;
  const agent = findAgent(slug);
  if (!agent) notFound();

  return (
    <Workspace
      slug={agent.slug}
      label={agent.label}
      blurb={agent.blurb}
      stage={agent.stage}
      starters={agent.starters}
      actions={agent.actions}
      nav={AGENTS.map((a) => ({ slug: a.slug, label: a.label, stage: a.stage }))}
    />
  );
}
