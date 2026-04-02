export type ExperimentStat = {
  experimentKey: string;
  runs: number;
  successCount: number;
  neutralCount: number;
  failureCount: number;
  successRate: number;
  avgDeltaPct: number;
};

export type ExperimentPrediction = {
  experimentKey: string;
  expectedLiftPct: number;
  confidence: "low" | "medium" | "high";
  predictionScore: number;
  neutralRate: number;
  autoRunEligible: boolean;
  autoRunReason: string;
};

function getConfidence(runs: number): "low" | "medium" | "high" {
  if (runs >= 10) return "high";
  if (runs >= 4) return "medium";
  return "low";
}

function getConfidenceMultiplier(confidence: "low" | "medium" | "high"): number {
  if (confidence === "high") return 1;
  if (confidence === "medium") return 0.85;
  return 0.65;
}

function getAutoRunDecision(
  confidence: "low" | "medium" | "high",
  expectedLiftPct: number,
  runs: number
): { autoRunEligible: boolean; autoRunReason: string } {
  if (confidence !== "high") {
    return {
      autoRunEligible: false,
      autoRunReason: "Confidence is not high enough",
    };
  }

  if (runs < 10) {
    return {
      autoRunEligible: false,
      autoRunReason: "Not enough historical runs",
    };
  }

  if (expectedLiftPct < 0.05) {
    return {
      autoRunEligible: false,
      autoRunReason: "Expected lift is below auto-run threshold",
    };
  }

  return {
    autoRunEligible: true,
    autoRunReason: "High confidence and strong expected lift",
  };
}

export function predictExperimentOutcomes(
  stats: ExperimentStat[]
): ExperimentPrediction[] {
  const predictions = stats.map((stat) => {
    const confidence = getConfidence(stat.runs);
    const confidenceMultiplier = getConfidenceMultiplier(confidence);

    const neutralRate = stat.runs > 0 ? stat.neutralCount / stat.runs : 0;

    // Improved MVP prediction:
    // successes count fully
    // neutral outcomes count partially
    const expectedLiftPct =
      (
        stat.successRate * stat.avgDeltaPct +
        neutralRate * stat.avgDeltaPct * 0.25
      ) * confidenceMultiplier;

    const predictionScore = expectedLiftPct * 100;

    const autoRun = getAutoRunDecision(
      confidence,
      expectedLiftPct,
      stat.runs
    );

    return {
      experimentKey: stat.experimentKey,
      expectedLiftPct,
      confidence,
      predictionScore,
      neutralRate,
      autoRunEligible: autoRun.autoRunEligible,
      autoRunReason: autoRun.autoRunReason,
    };
  });

  predictions.sort((a, b) => b.predictionScore - a.predictionScore);

  return predictions;
}