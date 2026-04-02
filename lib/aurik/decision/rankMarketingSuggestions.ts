export type MarketingActionSuggestion = {
  key: string;
  title: string;
  description: string;
};

export type MarketingExperimentStat = {
  experimentKey: string;
  runs: number;
  successCount: number;
  neutralCount: number;
  failureCount: number;
  successRate: number;
  avgDeltaPct: number;
};

export type RankedMarketingSuggestion = MarketingActionSuggestion & {
  historicalRuns: number;
  historicalSuccessRate: number | null;
  historicalAvgDeltaPct: number | null;
  historicalStatus: "proven" | "untested" | "weak";
  rankingScore: number;
};

function getHistoricalStatus(
  runs: number,
  successRate: number,
  avgDeltaPct: number
): "proven" | "untested" | "weak" {
  if (runs === 0) return "untested";
  if (successRate >= 0.5 || avgDeltaPct > 0.1) return "proven";
  return "weak";
}

function computeRankingScore(
  runs: number,
  successRate: number,
  avgDeltaPct: number
): number {
  if (runs === 0) {
    return 0.05;
  }

  return successRate * 10 + avgDeltaPct * 5 + Math.min(runs, 10) * 0.1;
}

export function rankMarketingSuggestions(
  suggestions: MarketingActionSuggestion[],
  stats: MarketingExperimentStat[]
): RankedMarketingSuggestion[] {
  const statsMap = new Map<string, MarketingExperimentStat>();

  for (const stat of stats) {
    statsMap.set(stat.experimentKey, stat);
  }

  const ranked = suggestions.map((suggestion) => {
    const stat = statsMap.get(suggestion.key);

    const runs = stat?.runs ?? 0;
    const successRate = stat?.successRate ?? 0;
    const avgDeltaPct = stat?.avgDeltaPct ?? 0;

    return {
      ...suggestion,
      historicalRuns: runs,
      historicalSuccessRate: runs > 0 ? successRate : null,
      historicalAvgDeltaPct: runs > 0 ? avgDeltaPct : null,
      historicalStatus: getHistoricalStatus(runs, successRate, avgDeltaPct),
      rankingScore: computeRankingScore(runs, successRate, avgDeltaPct),
    };
  });

  ranked.sort((a, b) => {
    if (b.rankingScore !== a.rankingScore) {
      return b.rankingScore - a.rankingScore;
    }

    return a.title.localeCompare(b.title);
  });

  return ranked;
}