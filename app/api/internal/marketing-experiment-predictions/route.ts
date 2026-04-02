import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { predictExperimentOutcomes } from "@/lib/aurik/learning/experimentPrediction";

type ExperimentOutcomeRow = {
  experiment_key: string;
  delta_pct: number;
  outcome: "success" | "neutral" | "failure";
};

type ExperimentStat = {
  experimentKey: string;
  runs: number;
  successCount: number;
  neutralCount: number;
  failureCount: number;
  successRate: number;
  avgDeltaPct: number;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentName = searchParams.get("agentName");

    if (!agentName) {
      return NextResponse.json(
        { ok: false, error: "Missing agentName" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("agent_experiment_outcomes")
      .select("experiment_key, delta_pct, outcome")
      .eq("agent_name", agentName)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as ExperimentOutcomeRow[];
    const grouped = new Map<string, ExperimentStat>();

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

      if (row.outcome === "success") stat.successCount += 1;
      else if (row.outcome === "neutral") stat.neutralCount += 1;
      else if (row.outcome === "failure") stat.failureCount += 1;
    }

    const stats = Array.from(grouped.values()).map((stat) => {
      const avgDeltaPct = stat.runs > 0 ? stat.avgDeltaPct / stat.runs : 0;
      const successRate = stat.runs > 0 ? stat.successCount / stat.runs : 0;

      return {
        ...stat,
        avgDeltaPct,
        successRate,
      };
    });

    const predictions = predictExperimentOutcomes(stats);
    const topPrediction = predictions[0] ?? null;

    return NextResponse.json({
      ok: true,
      agentName,
      stats,
      predictions,
      topPrediction,
      autoRunCandidate:
        topPrediction && topPrediction.autoRunEligible ? topPrediction : null,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unhandled error" },
      { status: 500 }
    );
  }
}