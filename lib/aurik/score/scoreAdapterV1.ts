// lib/aurik/score/scoreAdapterV1.ts

import { AurikScoreEngineV1 } from "./scoreEngine";

export type AgentMetricsLike = {
  tasks_count: number;
  avg_output_length: number;
};

export function computeScoreFromAgentMetrics(
  metrics: AgentMetricsLike,
) {
  return AurikScoreEngineV1.compute({
    tasksCount: metrics.tasks_count,
    avgOutputLength: metrics.avg_output_length,
  });
}