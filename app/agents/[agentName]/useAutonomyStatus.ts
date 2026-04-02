"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type ExperimentAutonomyResp,
} from "./autonomyPanelShared";

export type UseAutonomyStatusResult = {
  loading: boolean;
  error: string | null;
  autonomy: ExperimentAutonomyResp | null;
  refresh: () => Promise<void>;
};

export function useAutonomyStatus(
  agentName: string
): UseAutonomyStatusResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autonomy, setAutonomy] =
    useState<ExperimentAutonomyResp | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        "/api/internal/experiment-autonomy-status",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ agentName }),
          cache: "no-store",
        }
      );

      const json = (await res.json()) as ExperimentAutonomyResp;

      if (!json.ok) {
        setError(json.error);
        setAutonomy(null);
        return;
      }

      setAutonomy(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setAutonomy(null);
    } finally {
      setLoading(false);
    }
  }, [agentName]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return {
    loading,
    error,
    autonomy,
    refresh: fetchStatus,
  };
}