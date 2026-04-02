export type Prediction = {
  experimentKey: string;
  expectedLiftPct: number;
  confidence: "low" | "medium" | "high";
  predictionScore: number;
  neutralRate: number;
  autoRunEligible: boolean;
  autoRunReason: string;
};

export type PredictionResp =
  | {
      ok: true;
      agentName: string;
      predictions: Prediction[];
      topPrediction: Prediction | null;
      autoRunCandidate: Prediction | null;
    }
  | { ok: false; error: string };

export type ExperimentStat = {
  experimentKey: string;
  runs: number;
  successCount: number;
  neutralCount: number;
  failureCount: number;
  successRate: number;
  avgDeltaPct: number;
};

export type StatsResp =
  | {
      ok: true;
      agentName: string;
      stats: ExperimentStat[];
    }
  | { ok: false; error: string };

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

export type ExperimentAutonomyResult =
  | {
      ok: true;
      action: "experiment_started" | "no_action";
      decision: "auto_run" | "safe_override" | "no_action";
      riskLevel: "low" | "medium";
      reason: string;
      experimentKey?: string;
      impactId?: string;
      debug?: AutonomyDebugInfo;
    }
  | {
      ok: false;
      error: string;
    };

export type ExperimentAutonomyResp =
  | {
      ok: true;
      agentName: string;
      action: "experiment_started" | "no_action";
      decision: "auto_run" | "safe_override" | "no_action";
      riskLevel: "low" | "medium";
      reason: string;
      experimentKey?: string;
      impactId?: string;
      result: ExperimentAutonomyResult;
    }
  | {
      ok: false;
      error: string;
    };

export type RunnerResult = {
  agentName: string;
  ok: boolean;
  action?: "experiment_started" | "no_action";
  decision?: "auto_run" | "safe_override" | "no_action";
  riskLevel?: "low" | "medium";
  reason?: string;
  experimentKey?: string;
  impactId?: string;
  debug?: AutonomyDebugInfo;
  error?: string;
};

export type RunnerCyclePayload = {
  agentsChecked?: number;
  experimentsTriggered?: number;
  normalAutoRuns?: number;
  safeOverrideRuns?: number;
  noActionCount?: number;
  failedAgents?: number;
  durationMs?: number;
  results?: RunnerResult[];
};

export type LastCycleResp =
  | {
      ok: true;
      lastCycle: {
        id: string;
        agent_name: string;
        event_type: string;
        payload: RunnerCyclePayload | null;
        created_at: string;
      } | null;
    }
  | { ok: false; error: string };

export type DerivedDecision = {
  decision: "auto_run" | "safe_override" | "no_action";
  riskLevel: "low" | "medium";
  reason: string;
};

export type DerivedDebug = {
  confidence?: "low" | "medium" | "high";
  totalRuns?: number;
  successRate?: number;
  failureRate?: number;
  neutralRate?: number;
  expectedLiftPct?: number;
  predictionScore?: number;
  autoRunEligible?: boolean;
  autoRunReason?: string;
  blockedBy: string[];
};

export function fmtPct(x: number | null | undefined) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const pct = x * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function fmtNumber(x: number | null | undefined, digits = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return x.toFixed(digits);
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function formatDurationMs(ms: number | null | undefined) {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) {
    return "0m";
  }

  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.ceil((totalSeconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes}m`;
  }

  if (minutes <= 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

export function confidenceClasses(confidence: Prediction["confidence"]) {
  switch (confidence) {
    case "high":
      return "bg-green-100 text-green-800 border-green-200";
    case "medium":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "low":
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export function decisionClasses(decision: DerivedDecision["decision"]) {
  if (decision === "auto_run") {
    return "bg-green-100 text-green-800 border-green-200";
  }

  if (decision === "safe_override") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function riskClasses(riskLevel: DerivedDecision["riskLevel"]) {
  if (riskLevel === "medium") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function cycleStatusClass(
  failedAgents: number,
  experimentsTriggered: number,
  safeOverrideRuns: number
) {
  if (failedAgents > 0) {
    return "bg-red-100 text-red-800 border-red-200";
  }

  if (safeOverrideRuns > 0) {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }

  if (experimentsTriggered > 0) {
    return "bg-green-100 text-green-800 border-green-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function resultBadgeClass(result: RunnerResult) {
  if (!result.ok) {
    return "bg-red-100 text-red-800 border-red-200";
  }

  if (result.action === "experiment_started" && result.decision === "safe_override") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }

  if (result.action === "experiment_started" && result.decision === "auto_run") {
    return "bg-green-100 text-green-800 border-green-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function resultBadgeLabel(result: RunnerResult) {
  if (!result.ok) return "error";
  if (result.action === "experiment_started" && result.decision === "auto_run") {
    return "auto-run";
  }
  if (result.action === "experiment_started" && result.decision === "safe_override") {
    return "safe override";
  }
  return "no action";
}

export function blockedByLabel(key: string) {
  switch (key) {
    case "missing_impact":
      return "Missing impact";
    case "missing_experiment_history":
      return "Missing experiment history";
    case "missing_prediction_candidate":
      return "Missing prediction candidate";
    case "missing_top_prediction":
      return "Missing top prediction";
    case "unknown_experiment_key":
      return "Unknown experiment key";
    case "missing_stats_for_top_prediction":
      return "Missing stats for top prediction";
    case "already_running":
      return "Already running";
    case "cooldown_active":
      return "Cooldown active";
    case "missing_prediction":
      return "Missing prediction";
    case "missing_stat":
      return "Missing stats";
    case "bootstrap_safe_override_requires_min_1_run":
      return "Bootstrap requires at least 1 run";
    case "bootstrap_safe_override_requires_neutral_rate_eq_1":
      return "Bootstrap requires 100% neutral rate";
    case "safe_override_requires_low_confidence":
      return "Safe override requires low confidence";
    case "safe_override_requires_zero_failures":
      return "Safe override requires zero failures";
    case "safe_override_requires_min_3_runs":
      return "Safe override requires at least 3 runs";
    case "safe_override_requires_neutral_rate_gte_0_6":
      return "Safe override requires neutral rate ≥ 60%";
    case "not_auto_run_eligible":
      return "Not auto-run eligible";
    default:
      return key;
  }
}

export function deriveDecision(
  prediction: Prediction | null,
  stat: ExperimentStat | null
): DerivedDecision {
  if (!prediction) {
    return {
      decision: "no_action",
      riskLevel: "low",
      reason: "No experiment prediction available yet",
    };
  }

  if (!stat) {
    return {
      decision: "no_action",
      riskLevel: "low",
      reason: "No experiment stats available for the top prediction",
    };
  }

  if (prediction.autoRunEligible) {
    return {
      decision: "auto_run",
      riskLevel: "low",
      reason: "Auto-run eligible (confidence & success threshold met)",
    };
  }

  const failureRate = stat.runs > 0 ? stat.failureCount / stat.runs : 0;

  const qualifiesBootstrap =
    prediction.confidence === "low" &&
    stat.runs >= 1 &&
    failureRate === 0 &&
    prediction.neutralRate >= 1;

  if (qualifiesBootstrap) {
    return {
      decision: "safe_override",
      riskLevel: "medium",
      reason:
        "Bootstrap safe override: first result was neutral, no failures detected, confirmation run allowed",
    };
  }

  const qualifiesStandard =
    prediction.confidence === "low" &&
    stat.runs >= 3 &&
    failureRate === 0 &&
    prediction.neutralRate >= 0.6;

  if (qualifiesStandard) {
    return {
      decision: "safe_override",
      riskLevel: "medium",
      reason:
        "Low confidence but stable neutral outcomes, no failures, sufficient runs",
    };
  }

  return {
    decision: "no_action",
    riskLevel: "low",
    reason:
      prediction.autoRunReason || "Conditions not met for auto-run or safe override",
  };
}

export function deriveDebug(
  prediction: Prediction | null,
  stat: ExperimentStat | null
): DerivedDebug {
  if (!prediction) {
    return {
      blockedBy: ["missing_prediction"],
    };
  }

  if (!stat) {
    return {
      confidence: prediction.confidence,
      expectedLiftPct: prediction.expectedLiftPct,
      predictionScore: prediction.predictionScore,
      neutralRate: prediction.neutralRate,
      autoRunEligible: prediction.autoRunEligible,
      autoRunReason: prediction.autoRunReason,
      blockedBy: ["missing_stat"],
    };
  }

  const failureRate = stat.runs > 0 ? stat.failureCount / stat.runs : 0;

  const debug: DerivedDebug = {
    confidence: prediction.confidence,
    totalRuns: stat.runs,
    successRate: stat.successRate,
    failureRate,
    neutralRate: prediction.neutralRate,
    expectedLiftPct: prediction.expectedLiftPct,
    predictionScore: prediction.predictionScore,
    autoRunEligible: prediction.autoRunEligible,
    autoRunReason: prediction.autoRunReason,
    blockedBy: [],
  };

  if (prediction.autoRunEligible) {
    return debug;
  }

  const qualifiesBootstrap =
    prediction.confidence === "low" &&
    stat.runs >= 1 &&
    failureRate === 0 &&
    prediction.neutralRate >= 1;

  const qualifiesStandard =
    prediction.confidence === "low" &&
    stat.runs >= 3 &&
    failureRate === 0 &&
    prediction.neutralRate >= 0.6;

  if (qualifiesBootstrap || qualifiesStandard) {
    return debug;
  }

  if (prediction.confidence !== "low") {
    debug.blockedBy.push("safe_override_requires_low_confidence");
  }

  if (failureRate > 0) {
    debug.blockedBy.push("safe_override_requires_zero_failures");
  }

  if (stat.runs < 1) {
    debug.blockedBy.push("bootstrap_safe_override_requires_min_1_run");
  }

  if (prediction.neutralRate < 1) {
    debug.blockedBy.push("bootstrap_safe_override_requires_neutral_rate_eq_1");
  }

  if (stat.runs < 3) {
    debug.blockedBy.push("safe_override_requires_min_3_runs");
  }

  if (prediction.neutralRate < 0.6) {
    debug.blockedBy.push("safe_override_requires_neutral_rate_gte_0_6");
  }

  if (debug.blockedBy.length === 0) {
    debug.blockedBy.push("not_auto_run_eligible");
  }

  return debug;
}