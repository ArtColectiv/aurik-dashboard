import { NextResponse } from "next/server";
import { computeMarketingDecision } from "@/lib/aurik/decision/marketingDecisionEngine";
import { getMarketingActionSuggestions } from "@/lib/aurik/decision/marketingActionSuggestions";
import {
  rankMarketingSuggestions,
  type RankedMarketingSuggestion,
  type MarketingExperimentStat,
} from "@/lib/aurik/decision/rankMarketingSuggestions";
import { supabaseServer } from "@/lib/aurik/supabaseServer";

type ExperimentOutcomeRow = {
  experiment_key: string;
  delta_pct: number;
  outcome: "success" | "neutral" | "failure";
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { score, pointsCount, agentName } = body;

    if (!score || typeof pointsCount !== "number") {
      return NextResponse.json(
        { ok: false, error: "Invalid payload" },
        { status: 400 }
      );
    }

    const decision = computeMarketingDecision(score, pointsCount);
    const suggestions = getMarketingActionSuggestions(decision.state);

    let stats: MarketingExperimentStat[] = [];

    let rankedSuggestions: RankedMarketingSuggestion[] = suggestions.map((suggestion) => ({
      ...suggestion,
      historicalRuns: 0,
      historicalSuccessRate: null,
      historicalAvgDeltaPct: null,
      historicalStatus: "untested",
      rankingScore: 0.05,
    }));

    if (agentName && typeof agentName === "string") {
      const supabase = supabaseServer();

      const { data, error } = await supabase
        .from("agent_experiment_outcomes")
        .select("experiment_key, delta_pct, outcome")
        .eq("agent_name", agentName)
        .order("created_at", { ascending: false });

      if (!error) {
        const rows = (data ?? []) as ExperimentOutcomeRow[];
        const grouped = new Map<string, MarketingExperimentStat>();

        for (const row of rows) {
          const key = row.experiment_key;

          if (!grouped.has(key)) {
            grouped.set(key, {
              experimentKey: key,
              runs: 0,
              successCount: 0,
              neutralCount: 0,
              failureCount: 0,
              successRate: 0,
              avgDeltaPct: 0,
            });
          }

          const stat = grouped.get(key)!;

          stat.runs += 1;
          stat.avgDeltaPct += Number(row.delta_pct ?? 0);

          if (row.outcome === "success") {
            stat.successCount += 1;
          } else if (row.outcome === "neutral") {
            stat.neutralCount += 1;
          } else if (row.outcome === "failure") {
            stat.failureCount += 1;
          }
        }

        stats = Array.from(grouped.values()).map((stat) => {
          const avgDeltaPct = stat.runs > 0 ? stat.avgDeltaPct / stat.runs : 0;
          const successRate = stat.runs > 0 ? stat.successCount / stat.runs : 0;

          return {
            ...stat,
            avgDeltaPct,
            successRate,
          };
        });

        rankedSuggestions = rankMarketingSuggestions(suggestions, stats);
      }
    }

    return NextResponse.json({
      ok: true,
      decision,
      suggestions,
      rankedSuggestions,
      stats,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unhandled error" },
      { status: 500 }
    );
  }
}