"use client";

import ReportClient from "./report-client";
import { AgentMarketingPanel } from "../AgentMarketingPanel";
import AgentQuickActions from "../AgentQuickActions";
import AgentShortcutsPanel from "../AgentShortcutsPanel";
import { AgentTaskConsole } from "../AgentTaskConsole";
import AgentTrajectoryPanel from "./AgentTrajectoryPanel";
import AgentIntelligenceDashboard from "./AgentIntelligenceDashboard";
import { AgentInsightsProvider } from "./AgentInsightsContext";
import AgentLeadGenerationPanel from "../AgentLeadGenerationPanel";
import AgentActionPanel from "../AgentActionPanel";

type Props = {
  agentId: string;
  agentSlug: string;
  initialScore: number;
  initialExperience: number;
};

export default function AgentPageClient({
  agentId,
  agentSlug,
  initialScore,
  initialExperience,
}: Props) {
  return (
    <AgentInsightsProvider agentName={agentSlug}>
      <div className="flex flex-col gap-6 p-6">
        <AgentIntelligenceDashboard
          agentId={agentId}
          agentSlug={agentSlug}
          initialScore={initialScore}
          initialExperience={initialExperience}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AgentQuickActions agentId={agentId} agentName={agentSlug} />
          <AgentShortcutsPanel agentId={agentId} agentName={agentSlug} />
        </div>

        <AgentTrajectoryPanel agentId={agentId} agentName={agentSlug} n={10} />

        <AgentActionPanel
          agentId={agentId}
          agentName={agentSlug}
        />

        <AgentLeadGenerationPanel
          agentId={agentId}
          agentName={agentSlug}
        />

        <AgentMarketingPanel agentId={agentId} agentName={agentSlug} />

        <AgentTaskConsole agentId={agentId} />
        <ReportClient agentId={agentId} />
      </div>
    </AgentInsightsProvider>
  );
}