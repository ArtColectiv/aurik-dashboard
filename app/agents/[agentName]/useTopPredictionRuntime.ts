"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type ExperimentAutonomyResp,
  type ExperimentStat,
  type Prediction,
  type PredictionResp,
  type StatsResp,
} from "./autonomyPanelShared";

type ManualRunResponse =
  | {
      ok: true;
      agentName: string;
      action: "experiment_started" | "no_action";
      decision: "auto_run" | "safe_override" | "no_action";
      riskLevel: "low" | "medium";
      reason: string;
      experimentKey: string | null;
      impactId: string | null;
    }
  | {
      ok: false;
      error: string;
    };

type ManualRunTone = "success" | "neutral" | "error" | null;

export type UseTopPredictionRuntimeResult = {
  loading: boolean;
  manualRunLoading: boolean;
  err: string | null;
  manualRunMessage: string | null;
  manualRunTone: ManualRunTone;
  topPrediction: Prediction | null;
  predictions: Prediction[];
  statsMap: Record<string, ExperimentStat>;
  autonomyResp: ExperimentAutonomyResp | null;
  fetchPredictions: () => Promise<void>;
  runExperimentManually: () => Promise<void>;
};

export function useTopPredictionRuntime(
  agentName: string
): UseTopPredictionRuntimeResult {
  const [loading, setLoading] = useState(false);
  const [manualRunLoading, setManualRunLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manualRunMessage, setManualRunMessage] = useState<string | null>(null);
  const [manualRunTone, setManualRunTone] = useState<ManualRunTone>(null);
  const [topPrediction, setTopPrediction] = useState<Prediction | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, ExperimentStat>>({});
  const [autonomyResp, setAutonomyResp] = useState<ExperimentAutonomyResp | null>(
    null
  );

  const fetchPredictions = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const [predictionRes, statsRes, autonomyRes] = await Promise.all([
        fetch(
          `/api/internal/marketing-experiment-predictions?agentName=${encodeURIComponent(
            agentName
          )}`,
          { cache: "no-store" }
        ),
        fetch(
          `/api/internal/marketing-experiment-stats?agentName=${encodeURIComponent(
            agentName
          )}`,
          { cache: "no-store" }
        ),
        fetch(`/api/internal/experiment-autonomy-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ agentName }),
          cache: "no-store",
        }),
      ]);

      const predictionJson = (await predictionRes.json()) as PredictionResp;
      const statsJson = (await statsRes.json()) as StatsResp;
      const autonomyJson = (await autonomyRes.json()) as ExperimentAutonomyResp;

      if (!predictionJson.ok) {
        setErr(predictionJson.error);
        setTopPrediction(null);
        setPredictions([]);
        setStatsMap({});
        setAutonomyResp(null);
        return;
      }

      if (!statsJson.ok) {
        setErr(statsJson.error);
        setTopPrediction(null);
        setPredictions([]);
        setStatsMap({});
        setAutonomyResp(null);
        return;
      }

      if (!autonomyJson.ok) {
        setErr(autonomyJson.error);
        setTopPrediction(null);
        setPredictions([]);
        setStatsMap({});
        setAutonomyResp(null);
        return;
      }

      const nextStatsMap: Record<string, ExperimentStat> = {};

      for (const stat of statsJson.stats) {
        nextStatsMap[stat.experimentKey] = stat;
      }

      setTopPrediction(predictionJson.topPrediction ?? null);
      setPredictions(
        Array.isArray(predictionJson.predictions) ? predictionJson.predictions : []
      );
      setStatsMap(nextStatsMap);
      setAutonomyResp(autonomyJson);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
      setTopPrediction(null);
      setPredictions([]);
      setStatsMap({});
      setAutonomyResp(null);
    } finally {
      setLoading(false);
    }
  }, [agentName]);

  const runExperimentManually = useCallback(async () => {
    setManualRunLoading(true);
    setManualRunMessage(null);
    setManualRunTone(null);

    try {
      const res = await fetch(`/api/internal/experiment-autonomy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ agentName }),
      });

      const json = (await res.json()) as ManualRunResponse;

      if (!json.ok) {
        setManualRunTone("error");
        setManualRunMessage(json.error);
        return;
      }

      if (json.action === "experiment_started") {
        setManualRunTone("success");
        setManualRunMessage(
          `🟢 Experiment started\n\n` +
            `Experiment: ${json.experimentKey ?? "unknown"}\n` +
            `Mode: ${json.decision}\n` +
            `Risk: ${json.riskLevel}`
        );
      } else {
        setManualRunTone("neutral");

        let explanation = "Execution blocked by autonomy guardrails.";

        if (json.reason.includes("Conditions not met")) {
          explanation =
            "Not enough validated data to safely run this experiment.";
        }

        if (json.reason.toLowerCase().includes("cooldown")) {
          explanation = "Experiment is in cooldown period.";
        }

        if (json.reason.toLowerCase().includes("already running")) {
          explanation = "Experiment is already running.";
        }

        setManualRunMessage(
          `🟡 Execution blocked\n\n` +
            `Experiment: ${json.experimentKey ?? "unknown"}\n` +
            `Reason: ${explanation}\n\n` +
            `👉 Next step: Collect more data or wait for conditions to improve`
        );
      }

      await fetchPredictions();
    } catch (e) {
      setManualRunTone("error");
      setManualRunMessage(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setManualRunLoading(false);
    }
  }, [agentName, fetchPredictions]);

  useEffect(() => {
    void fetchPredictions();
  }, [fetchPredictions]);

  return {
    loading,
    manualRunLoading,
    err,
    manualRunMessage,
    manualRunTone,
    topPrediction,
    predictions,
    statsMap,
    autonomyResp,
    fetchPredictions,
    runExperimentManually,
  };
}