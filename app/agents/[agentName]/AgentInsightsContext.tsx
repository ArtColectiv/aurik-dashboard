"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type ExperimentAutonomyResp,
  type ExperimentStat,
  type Prediction,
  type PredictionResp,
  type StatsResp,
} from "./autonomyPanelShared";

type AgentInsightsContextValue = {
  agentName: string;
  loading: boolean;
  error: string | null;
  autonomyResp: ExperimentAutonomyResp | null;
  predictionResp: PredictionResp | null;
  statsResp: StatsResp | null;
  topPrediction: Prediction | null;
  predictions: Prediction[];
  statsMap: Record<string, ExperimentStat>;
  refreshAll: () => Promise<void>;
};

const AgentInsightsContext =
  createContext<AgentInsightsContextValue | null>(null);

type ProviderProps = {
  agentName: string;
  children: ReactNode;
};

export function AgentInsightsProvider({
  agentName,
  children,
}: ProviderProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autonomyResp, setAutonomyResp] =
    useState<ExperimentAutonomyResp | null>(null);
  const [predictionResp, setPredictionResp] =
    useState<PredictionResp | null>(null);
  const [statsResp, setStatsResp] = useState<StatsResp | null>(null);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [autonomyRes, predictionRes, statsRes] = await Promise.all([
        fetch("/api/internal/experiment-autonomy-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ agentName }),
          cache: "no-store",
        }),
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
      ]);

      const autonomyJson = (await autonomyRes.json()) as ExperimentAutonomyResp;
      const predictionJson = (await predictionRes.json()) as PredictionResp;
      const statsJson = (await statsRes.json()) as StatsResp;

      if (!autonomyJson.ok) {
        setError(autonomyJson.error);
        setAutonomyResp(null);
        setPredictionResp(null);
        setStatsResp(null);
        return;
      }

      if (!predictionJson.ok) {
        setError(predictionJson.error);
        setAutonomyResp(null);
        setPredictionResp(null);
        setStatsResp(null);
        return;
      }

      if (!statsJson.ok) {
        setError(statsJson.error);
        setAutonomyResp(null);
        setPredictionResp(null);
        setStatsResp(null);
        return;
      }

      setAutonomyResp(autonomyJson);
      setPredictionResp(predictionJson);
      setStatsResp(statsJson);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setAutonomyResp(null);
      setPredictionResp(null);
      setStatsResp(null);
    } finally {
      setLoading(false);
    }
  }, [agentName]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const value = useMemo<AgentInsightsContextValue>(() => {
    const predictions =
      predictionResp?.ok && Array.isArray(predictionResp.predictions)
        ? predictionResp.predictions
        : [];

    const topPrediction =
      predictionResp?.ok ? predictionResp.topPrediction ?? null : null;

    const statsMap: Record<string, ExperimentStat> = {};

    if (statsResp?.ok) {
      for (const stat of statsResp.stats) {
        statsMap[stat.experimentKey] = stat;
      }
    }

    return {
      agentName,
      loading,
      error,
      autonomyResp,
      predictionResp,
      statsResp,
      topPrediction,
      predictions,
      statsMap,
      refreshAll,
    };
  }, [agentName, loading, error, autonomyResp, predictionResp, statsResp, refreshAll]);

  return (
    <AgentInsightsContext.Provider value={value}>
      {children}
    </AgentInsightsContext.Provider>
  );
}

export function useAgentInsights(): AgentInsightsContextValue {
  const ctx = useContext(AgentInsightsContext);

  if (!ctx) {
    throw new Error(
      "useAgentInsights must be used inside AgentInsightsProvider"
    );
  }

  return ctx;
}