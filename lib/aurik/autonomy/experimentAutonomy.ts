// lib/aurik/autonomy/experimentAutonomy.ts

import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { getAgentBySlug } from "@/lib/aurik/agents/getAgentBySlug";
import {
  predictExperimentOutcomes,
  type ExperimentPrediction,
  type ExperimentStat,
} from "@/lib/aurik/learning/experimentPrediction";
import {
  getMarketingExperimentByKey,
  type MarketingExperiment,
} from "@/lib/aurik/decision/marketingExperimentRegistry";
import {
  executeAction,
  type ActionPayload,
} from "@/lib/aurik/actions/actionExecutor";

const EXPERIMENT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export type AutonomyDecisionType =
  | "auto_run"
  | "safe_override"
  | "no_action";

export type AutonomyDecision = {
  decision: AutonomyDecisionType;
  reason: string;
  riskLevel: "low" | "medium";
};

type PredictionStats = {
  confidence: "low" | "medium" | "high";
  successRate: number;
  failureRate: number;
  neutralRate: number;
  totalRuns: number;
};

type DecideAutonomyParams = {
  autoRunEligible: boolean;
  stats: PredictionStats;
  alreadyRunning?: boolean;
  cooldownActive?: boolean;
};

type AgentExperimentOutcomeRow = {
  experiment_key: string;
  delta_pct: number | null;
  outcome: "success" | "neutral" | "failure";
};

type AgentImpactRow = {
  id: string;
};

type AgentEventRow = {
  event_type: string;
  payload: unknown;
  created_at: string;
};

type LatestOutcomeRow = {
  created_at: string;
};

type RunningExperimentInfo = {
  isRunning: boolean;
  startedAt: string | null;
  latestStartedAt: string | null;
};

export type AutonomyDebugInfo = {
  experimentKey?: string;
  impactId?: string;
  confidence?: "low" | "medium" | "high";
  totalRuns?: number;
  successRate?: number;
  failureRate?: number;
  neutralRate?: number;
  expectedLiftPct?: number;
  predictionScore?: number;
  autoRunEligible?: boolean;
  autoRunReason?: string;
  alreadyRunning?: boolean;
  runningStartedAt?: string | null;
  latestStartedAt?: string | null;
  cooldownMs?: number;
  cooldownActive?: boolean;
  cooldownRemainingMs?: number;
  blockedBy?: string[];
};

type BaseAutonomySuccess = {
  ok: true;
  action: "experiment_started" | "no_action";
  decision: AutonomyDecisionType;
  riskLevel: "low" | "medium";
  reason: string;
  experimentKey?: string;
  impactId?: string;
  debug?: AutonomyDebugInfo;
};

export type GetExperimentAutonomyStatusResult =
  | BaseAutonomySuccess
  | {
      ok: false;
      error: string;
    };

type RunExperimentAutonomySuccess = BaseAutonomySuccess;

type RunExperimentAutonomyError = {
  ok: false;
  error: string;
};

export type RunExperimentAutonomyResult =
  | RunExperimentAutonomySuccess
  | RunExperimentAutonomyError;

function qualifiesBootstrapSafeOverride(stats: PredictionStats): boolean {
  return (
    stats.confidence === "low" &&
    stats.totalRuns >= 1 &&
    stats.failureRate === 0 &&
    stats.neutralRate >= 1
  );
}

function qualifiesStandardSafeOverride(stats: PredictionStats): boolean {
  return (
    stats.confidence === "low" &&
    stats.totalRuns >= 3 &&
    stats.failureRate === 0 &&
    stats.neutralRate >= 0.6
  );
}

export function decideAutonomy({
  autoRunEligible,
  stats,
  alreadyRunning = false,
  cooldownActive = false,
}: DecideAutonomyParams): AutonomyDecision {
  if (alreadyRunning) {
    return {
      decision: "no_action",
      reason: "Experiment already running",
      riskLevel: "low",
    };
  }

  if (cooldownActive) {
    return {
      decision: "no_action",
      reason: "Experiment cooldown active",
      riskLevel: "low",
    };
  }

  if (autoRunEligible) {
    return {
      decision: "auto_run",
      reason: "Auto-run eligible (confidence & success threshold met)",
      riskLevel: "low",
    };
  }

  if (qualifiesBootstrapSafeOverride(stats)) {
    return {
      decision: "safe_override",
      reason:
        "Bootstrap safe override: first result was neutral, no failures detected, confirmation run allowed",
      riskLevel: "medium",
    };
  }

  if (qualifiesStandardSafeOverride(stats)) {
    return {
      decision: "safe_override",
      reason:
        "Low confidence but stable neutral outcomes, no failures, sufficient runs",
      riskLevel: "medium",
    };
  }

  return {
    decision: "no_action",
    reason: "Conditions not met for auto-run or safe override",
    riskLevel: "low",
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPayloadExperimentKey(payload: unknown): string | null {
  if (!isPlainObject(payload)) return null;
  const experimentKey = payload["experimentKey"];
  return typeof experimentKey === "string" && experimentKey.trim()
    ? experimentKey.trim()
    : null;
}

function buildStatsMap(stats: ExperimentStat[]): Map<string, ExperimentStat> {
  return new Map(stats.map((stat) => [stat.experimentKey, stat]));
}

function toTimestamp(value: string | null): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function getCooldownRemainingMs(latestStartedAt: string | null): number {
  const latestStartedTs = toTimestamp(latestStartedAt);
  if (latestStartedTs === null) return 0;
  const elapsedMs = Date.now() - latestStartedTs;
  const remainingMs = EXPERIMENT_COOLDOWN_MS - elapsedMs;
  return remainingMs > 0 ? remainingMs : 0;
}

function buildBlockedBy(params: {
  autoRunEligible: boolean;
  stats: PredictionStats;
  alreadyRunning: boolean;
  cooldownActive: boolean;
}): string[] {
  const blockedBy: string[] = [];

  if (params.alreadyRunning) {
    blockedBy.push("already_running");
    return blockedBy;
  }

  if (params.cooldownActive) {
    blockedBy.push("cooldown_active");
    return blockedBy;
  }

  if (params.autoRunEligible) return blockedBy;
  if (qualifiesBootstrapSafeOverride(params.stats)) return blockedBy;
  if (qualifiesStandardSafeOverride(params.stats)) return blockedBy;

  if (params.stats.confidence !== "low")
    blockedBy.push("safe_override_requires_low_confidence");
  if (params.stats.failureRate > 0)
    blockedBy.push("safe_override_requires_zero_failures");
  if (params.stats.totalRuns < 1)
    blockedBy.push("bootstrap_safe_override_requires_min_1_run");
  if (params.stats.neutralRate < 1)
    blockedBy.push("bootstrap_safe_override_requires_neutral_rate_eq_1");
  if (params.stats.totalRuns < 3)
    blockedBy.push("safe_override_requires_min_3_runs");
  if (params.stats.neutralRate < 0.6)
    blockedBy.push("safe_override_requires_neutral_rate_gte_0_6");
  if (blockedBy.length === 0)
    blockedBy.push("not_auto_run_eligible");

  return blockedBy;
}

async function getLatestImpactId(agentName: string): Promise<string | null> {
  const agent = await getAgentBySlug(agentName);

  if (!agent) {
    throw new Error(`Agent not found for slug: ${agentName}`);
  }

  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("agent_marketing_impact")
    .select("id")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch latest impact: ${error.message}`);
  }

  const row = (data?.[0] ?? null) as AgentImpactRow | null;
  return row?.id ?? null;
}

async function getExperimentStats(
  agentName: string
): Promise<ExperimentStat[]> {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("agent_experiment_outcomes")
    .select("experiment_key, delta_pct, outcome")
    .eq("agent_name", agentName)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch experiment outcomes: ${error.message}`);
  }

  const rows = (data ?? []) as AgentExperimentOutcomeRow[];
const grouped = new Map<string, ExperimentStat & { totalDeltaPct: number }>();

  for (const row of rows) {
    const key =
      typeof row.experiment_key === "string" ? row.experiment_key.trim() : "";
    if (!key) continue;

    if (!grouped.has(key)) {
      grouped.set(key, {
        experimentKey: key,
        runs: 0,
        successCount: 0,
        neutralCount: 0,
        failureCount: 0,
        successRate: 0,
        avgDeltaPct: 0,
        totalDeltaPct: 0,
      });
    }

    const stat = grouped.get(key);
    if (!stat) continue;

    stat.runs += 1;
    stat.totalDeltaPct += Number(row.delta_pct ?? 0);

    if (row.outcome === "success") stat.successCount += 1;
    else if (row.outcome === "neutral") stat.neutralCount += 1;
    else if (row.outcome === "failure") stat.failureCount += 1;
  }

  const stats: ExperimentStat[] = Array.from(grouped.values()).map((stat) => {
    const avgDeltaPct = stat.runs > 0 ? stat.totalDeltaPct / stat.runs : 0;
    const successRate = stat.runs > 0 ? stat.successCount / stat.runs : 0;
    return {
      experimentKey: stat.experimentKey,
      runs: stat.runs,
      successCount: stat.successCount,
      neutralCount: stat.neutralCount,
      failureCount: stat.failureCount,
      successRate,
      avgDeltaPct,
    };
  });

  stats.sort((a, b) => {
    if (b.successRate !== a.successRate) return b.successRate - a.successRate;
    return b.avgDeltaPct - a.avgDeltaPct;
  });

  return stats;
}

async function getRunningExperimentInfo(
  agentName: string,
  experimentKey: string
): Promise<RunningExperimentInfo> {
  const supabase = supabaseServer();

  const { data: startedData, error: startedError } = await supabase
    .from("agent_events")
    .select("event_type, payload, created_at")
    .eq("agent_name", agentName)
    .eq("event_type", "marketing_experiment_started")
    .order("created_at", { ascending: false });

  if (startedError) {
    throw new Error(`Failed to fetch started events: ${startedError.message}`);
  }

  const startedRows = (startedData ?? []) as AgentEventRow[];
  const matchingStarted = startedRows.filter(
    (row) => getPayloadExperimentKey(row.payload) === experimentKey
  );

  const latestStartedAt = matchingStarted[0]?.created_at ?? null;

  const { data: outcomeData, error: outcomeError } = await supabase
    .from("agent_experiment_outcomes")
    .select("created_at")
    .eq("agent_name", agentName)
    .eq("experiment_key", experimentKey)
    .order("created_at", { ascending: false })
    .limit(1);

  if (outcomeError) {
    throw new Error(`Failed to fetch latest outcome: ${outcomeError.message}`);
  }

  const latestOutcome = (outcomeData?.[0] ?? null) as LatestOutcomeRow | null;
  const latestOutcomeAt = latestOutcome?.created_at ?? null;

  const latestStartedTs = toTimestamp(latestStartedAt);
  const latestOutcomeTs = toTimestamp(latestOutcomeAt);

  let isRunning = false;
  let startedAt: string | null = null;

  if (latestStartedTs !== null) {
    if (latestOutcomeTs === null || latestStartedTs > latestOutcomeTs) {
      isRunning = true;
      startedAt = latestStartedAt;
    }
  }

  return { isRunning, startedAt, latestStartedAt };
}

export async function getExperimentAutonomyStatus(
  agentName: string
): Promise<GetExperimentAutonomyStatusResult> {
  try {
    const [stats, impactId] = await Promise.all([
      getExperimentStats(agentName),
      getLatestImpactId(agentName),
    ]);

    const predictions = predictExperimentOutcomes(stats);
    const statsMap = buildStatsMap(stats);

    if (predictions.length === 0) {
      return {
        ok: true,
        action: "no_action",
        decision: "no_action",
        riskLevel: "low",
        reason: "No experiment data available",
        debug: { impactId: impactId ?? undefined, totalRuns: 0 },
      };
    }

    const prediction = predictions[0];
    const experimentKey = prediction.experimentKey;

    const runningInfo = await getRunningExperimentInfo(agentName, experimentKey);
    const stat = statsMap.get(experimentKey) ?? null;

    const totalRuns = stat?.runs ?? 0;
    const successRate = stat ? (stat.runs > 0 ? stat.successCount / stat.runs : 0) : 0;
    const failureRate = stat ? (stat.runs > 0 ? stat.failureCount / stat.runs : 0) : 0;
    const neutralRate = prediction.neutralRate;
    const confidence = prediction.confidence;
    const autoRunEligible = prediction.autoRunEligible;

    const predStats: PredictionStats = {
      confidence,
      successRate,
      failureRate,
      neutralRate,
      totalRuns,
    };

    const cooldownRemainingMs = getCooldownRemainingMs(runningInfo.latestStartedAt);
    const cooldownActive = cooldownRemainingMs > 0 && !runningInfo.isRunning;

    const { decision, reason, riskLevel } = decideAutonomy({
      autoRunEligible,
      stats: predStats,
      alreadyRunning: runningInfo.isRunning,
      cooldownActive,
    });

    const blockedBy = buildBlockedBy({
      autoRunEligible,
      stats: predStats,
      alreadyRunning: runningInfo.isRunning,
      cooldownActive,
    });

    const debug: AutonomyDebugInfo = {
      experimentKey,
      impactId: impactId ?? undefined,
      confidence,
      totalRuns,
      successRate,
      failureRate,
      neutralRate,
      expectedLiftPct: prediction.expectedLiftPct,
      predictionScore: prediction.predictionScore,
      autoRunEligible,
      autoRunReason: prediction.autoRunReason,
      alreadyRunning: runningInfo.isRunning,
      runningStartedAt: runningInfo.startedAt,
      latestStartedAt: runningInfo.latestStartedAt,
      cooldownMs: EXPERIMENT_COOLDOWN_MS,
      cooldownActive,
      cooldownRemainingMs,
      blockedBy,
    };

    return {
      ok: true,
      action: decision === "no_action" ? "no_action" : "experiment_started",
      decision,
      riskLevel,
      reason,
      experimentKey,
      impactId: impactId ?? undefined,
      debug,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function runExperimentAutonomy(
  agentName: string
): Promise<RunExperimentAutonomyResult> {
  try {
    const statusResult = await getExperimentAutonomyStatus(agentName);

    if (!statusResult.ok) {
      return { ok: false, error: statusResult.error };
    }

    if (statusResult.decision === "no_action") {
      return {
        ok: true,
        action: "no_action",
        decision: statusResult.decision,
        riskLevel: statusResult.riskLevel,
        reason: statusResult.reason,
        experimentKey: statusResult.experimentKey,
        impactId: statusResult.impactId,
        debug: statusResult.debug,
      };
    }

    const experimentKey = statusResult.experimentKey;
    if (!experimentKey) {
      return { ok: false, error: "No experiment key resolved" };
    }

    const supabase = supabaseServer();
    await supabase.from("agent_events").insert({
      agent_name: agentName,
      event_type: "marketing_experiment_started",
      payload: { experimentKey, decision: statusResult.decision },
    });

    const experiment: MarketingExperiment | null =
      getMarketingExperimentByKey(experimentKey);

    if (experiment?.executable && experiment.actionKey) {
      const payload: ActionPayload = {
        actionType: "create_social_post",
        content: experiment.description,
        agentName,
        experimentKey,
      };

      const n = agentName.trim().toLowerCase();
      const activeSkillPacks: string[] = n.includes("finance")
        ? ["finance"]
        : n.includes("operations")
        ? ["operations"]
        : ["marketing"];

      const actionResult = await executeAction(payload, {
        agentLevel: 3,
        activeSkillPacks,
      });

      if (!actionResult.ok) {
        return { ok: false, error: actionResult.error ?? "Action execution failed" };
      }
    }

    return {
      ok: true,
      action: "experiment_started",
      decision: statusResult.decision,
      riskLevel: statusResult.riskLevel,
      reason: statusResult.reason,
      experimentKey,
      impactId: statusResult.impactId,
      debug: statusResult.debug,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}