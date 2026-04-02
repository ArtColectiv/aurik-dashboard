"use client";

import { useEffect, useState } from "react";

type Decision = {
  state: string;
  reason: string;
  recommendedAction: string;
};

type RankedSuggestion = {
  key: string;
  title: string;
  description: string;
  historicalRuns: number;
  historicalSuccessRate: number | null;
  historicalAvgDeltaPct: number | null;
  historicalStatus: "proven" | "untested" | "weak";
  rankingScore: number;
};

type DecisionResp =
  | {
      ok: true;
      decision: Decision;
      suggestions: RankedSuggestion[];
      rankedSuggestions: RankedSuggestion[];
      stats: Array<{
        experimentKey: string;
        runs: number;
        successCount: number;
        neutralCount: number;
        failureCount: number;
        successRate: number;
        avgDeltaPct: number;
      }>;
    }
  | { ok: false; error: string };

function fmtPct(x: number | null) {
  if (x === null || !Number.isFinite(x)) return "—";
  const pct = x * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function statusClasses(status: RankedSuggestion["historicalStatus"]) {
  switch (status) {
    case "proven":
      return "bg-green-100 text-green-800 border-green-200";
    case "weak":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "untested":
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export default function DecisionPanel(props: {
  agentName: string;
  score: {
    baseline: number;
    current: number;
    growth: number;
    momentum: number;
    stability: number;
    compositeScore: number;
  } | null;
  pointsCount: number;
}) {
  const { agentName, score, pointsCount } = props;

  const [decision, setDecision] = useState<Decision | null>(null);
  const [rankedSuggestions, setRankedSuggestions] = useState<RankedSuggestion[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchDecision() {
      if (!score) return;

      setLoading(true);
      setErr(null);

      try {
        const res = await fetch("/api/internal/impact-decision", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agentName,
            score,
            pointsCount,
          }),
        });

        const json = (await res.json()) as DecisionResp;

        if (!json.ok) {
          setErr(json.error);
          return;
        }

        setDecision(json.decision);
        setRankedSuggestions(Array.isArray(json.rankedSuggestions) ? json.rankedSuggestions : []);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchDecision();
  }, [agentName, score, pointsCount]);

  if (!score) return null;

  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm opacity-70">Decision</div>

      {err ? <div className="mt-2 text-sm text-red-600">{err}</div> : null}

      {loading && !decision ? (
        <div className="mt-2 text-sm opacity-70">Evaluating decision...</div>
      ) : null}

      {decision ? (
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="text-lg font-semibold">{decision.state}</div>
            <div className="text-sm opacity-80">{decision.reason}</div>
            <div className="text-sm font-medium">
              Recommended action: {decision.recommendedAction}
            </div>
          </div>

          <div className="rounded-lg bg-black/5 p-3">
            <div className="text-xs opacity-70">Ranked suggestions</div>

            {rankedSuggestions.length === 0 ? (
              <div className="mt-2 text-sm opacity-70">No suggestions available.</div>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {rankedSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.key}
                    className="flex flex-col gap-2 rounded-lg border bg-white p-3"
                  >
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{suggestion.title}</div>
                        <div className="text-sm opacity-80">{suggestion.description}</div>
                      </div>

                      <div
                        className={`inline-flex shrink-0 items-center rounded-md border px-2 py-1 text-xs font-medium ${statusClasses(
                          suggestion.historicalStatus
                        )}`}
                      >
                        {suggestion.historicalStatus}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-70">
                      <span>runs: {suggestion.historicalRuns}</span>
                      <span>success rate: {fmtPct(suggestion.historicalSuccessRate)}</span>
                      <span>avg delta: {fmtPct(suggestion.historicalAvgDeltaPct)}</span>
                      <span>rank: {suggestion.rankingScore.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}