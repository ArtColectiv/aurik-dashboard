import { notFound } from "next/navigation";
import { getAgentBySlug } from "@/lib/aurik/agents/getAgentBySlug";
import AgentPageClient from "./AgentPageClient";

type PageProps = {
  params: Promise<{
    agentName: string; // slug from URL (canonical: agentSlug)
  }>;
};

export default async function AgentPage({ params }: PageProps) {
  const { agentName } = await params;
  const agentSlug = agentName;

  const agent = await getAgentBySlug(agentSlug);

  if (!agent) {
    notFound();
  }

  return (
    <AgentPageClient
      agentId={agent.id}
      agentSlug={agent.agent_name}
      initialScore={agent.aurik_score}
      initialExperience={agent.aurik_experience_capital}
    />
  );
}