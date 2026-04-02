"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TrajectorySummaryPanel from "./TrajectorySummaryPanel";
import DecisionPanel from "./DecisionPanel";
import TopPredictionPanel from "./TopPredictionPanel";
import AutonomyStatusPanel from "./AutonomyStatusPanel";
import AutonomyRunnerStatusPanel from "./AutonomyRunnerStatusPanel";

type ImpactItem = {
  id: string;
  metric: string;
  actionType: string;
  createdAt: string;
  baselineValue: number;
  postValue: number | null;
  status: string;
};

type ImpactsResp =
  | { ok: true; agentId: string; impacts: ImpactItem[] }
  | { ok: false; error: string };

type CreateImpactResp =
  | { ok: true; impact: ImpactItem }
  | { ok: false; error: string };

type MarketingScoreImpact = {
  impactId: string;
  metric: string;
  actionType: string;
  weight: number;
  status: string | null;
  baselineValue: number;
  postValue: number | null;
  trajectoryOk: boolean;
  window: { n: number; minValue: number | null; maxValue: number | null } | null;
  score:
    | {
        baseline: number;
        current: number;
        growth: number;
        momentum: number;
        stability: number;
        compositeScore: number;
      }
    | null;
  pointsCount: number;
  error: string | null;
};

type MarketingScoreResp =
  | {
      ok: true;
      agentId: string;
      n: number;
      marketingScore: number;
      impacts: MarketingScoreImpact[];
    }
  | { ok: false; error: string; message?: string };

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function labelForImpact(i: ImpactItem) {
  const pv = i.postValue === null ? "—" : String(i.postValue);
  return `${i.metric} • ${i.actionType} • (${i.baselineValue} → ${pv}) • ${formatDate(
    i.createdAt
  )}`;
}

function fmtScore(x: number) {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

export default function AgentTrajectoryPanel(props: {
  agentId: string;
  agentName: string;
  n?: number;
}) {
  const { agentId, agentName, n = 10 } = props;

  const [impacts, setImpacts] = useState<ImpactItem[]>([]);
  const [selectedImpactId, setSelectedImpactId] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [msLoading, setMsLoading] = useState(false);
  const [msErr, setMsErr] = useState<string | null>(null);
  const [marketingScore, setMarketingScore] = useState<number>(0);
  const [marketingBreakdown, setMarketingBreakdown] = useState<MarketingScoreImpact[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createMetric, setCreateMetric] = useState("followers");
  const [createActionType, setCreateActionType] = useState("instagram_campaign");
  const [createBaseline, setCreateBaseline] = useState<number>(10);
  const [createStatus, setCreateStatus] = useState("active");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const [showMeasure, setShowMeasure] = useState(false);
  const [measureValue, setMeasureValue] = useState<number>(0);
  const [measuring, setMeasuring] = useState(false);
  const [measureErr, setMeasureErr] = useState<string | null>(null);

  const fetchMarketingScore = useCallback(async () => {
    setMsLoading(true);
    setMsErr(null);

    try {
      const res = await fetch(
        `/api/internal/agent-marketing-score?agentId=${encodeURIComponent(agentId)}&n=${encodeURIComponent(
          String(n)
        )}`,
        { cache: "no-store" }
      );

      const json = (await res.json()) as MarketingScoreResp;

      if (!json.ok) {
        setMarketingScore(0);
        setMarketingBreakdown([]);
        setMsErr(json.message ? `${json.error}: ${json.message}` : json.error);
        return;
      }

      setMarketingScore(Number(json.marketingScore ?? 0));
      setMarketingBreakdown(Array.isArray(json.impacts) ? json.impacts : []);
    } catch (e) {
      setMarketingScore(0);
      setMarketingBreakdown([]);
      setMsErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setMsLoading(false);
    }
  }, [agentId, n]);

  const fetchImpacts = useCallback(
    async (selectImpactId?: string) => {
      setLoading(true);
      setErr(null);

      try {
        const res = await fetch(
          `/api/internal/agent-marketing-impacts?agentId=${encodeURIComponent(agentId)}`,
          { cache: "no-store" }
        );

        const json = (await res.json()) as ImpactsResp;

        if (!json.ok) {
          setErr(json.error);
          setImpacts([]);
          setSelectedImpactId("");
          return;
        }

        const list = json.impacts ?? [];
        setImpacts(list);

        if (selectImpactId) {
          setSelectedImpactId(selectImpactId);
          return;
        }

        setSelectedImpactId((current) => {
          if (current && list.some((i) => i.id === current)) {
            return current;
          }
          return list.length > 0 ? list[0].id : "";
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Unknown error");
        setImpacts([]);
        setSelectedImpactId("");
      } finally {
        setLoading(false);
      }
    },
    [agentId]
  );

  const refreshAll = useCallback(
    async (selectImpactId?: string) => {
      await Promise.all([fetchImpacts(selectImpactId), fetchMarketingScore()]);
    },
    [fetchImpacts, fetchMarketingScore]
  );

  useEffect(() => {
    let active = true;

    (async () => {
      if (!active) return;
      await refreshAll();
    })();

    return () => {
      active = false;
    };
  }, [refreshAll]);

  useEffect(() => {
    const onFocus = () => {
      void refreshAll();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshAll();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    const interval = window.setInterval(() => {
      void refreshAll();
    }, 10000);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [refreshAll]);

  const selectedImpact = useMemo(
    () => impacts.find((i) => i.id === selectedImpactId) ?? null,
    [impacts, selectedImpactId]
  );

  const selectedImpactScore = useMemo(() => {
    return marketingBreakdown.find((b) => b.impactId === selectedImpactId) ?? null;
  }, [marketingBreakdown, selectedImpactId]);

  async function onCreateImpact() {
    setCreating(true);
    setCreateErr(null);

    try {
      const payload = {
        agentId,
        metric: createMetric.trim(),
        actionType: createActionType.trim(),
        baselineValue: Number(createBaseline),
        status: createStatus.trim(),
        meta: {
          created_from: "ui",
        },
      };

      const res = await fetch("/api/internal/agent-marketing-impact-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as CreateImpactResp;

      if (!json.ok) {
        setCreateErr(json.error);
        return;
      }

      setShowCreate(false);
      await refreshAll(json.impact.id);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  }

  async function onAddMeasurement() {
    if (!selectedImpactId) return;

    setMeasuring(true);
    setMeasureErr(null);

    try {
      const res = await fetch("/api/internal/impact-evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          impactId: selectedImpactId,
          postValue: Number(measureValue),
          metaPatch: {
            created_from: "ui_measurement",
          },
        }),
      });

      const json = (await res.json()) as { ok?: boolean; error?: string };

      if (!json.ok) {
        setMeasureErr(json.error ?? "Unknown error");
        return;
      }

      await refreshAll(selectedImpactId);
      setShowMeasure(false);
      setMeasureValue(0);
    } catch (e) {
      setMeasureErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setMeasuring(false);
    }
  }

  if (loading && impacts.length === 0) {
    return (
      <div className="rounded-xl border p-4">
        <div className="text-sm opacity-70">Trajectory</div>
        <div className="mt-2 text-sm">Chargement…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-xl border p-4">
        <div className="text-sm opacity-70">Trajectory</div>
        <div className="mt-2 text-sm text-red-600">{err}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AutonomyRunnerStatusPanel />
      <AutonomyStatusPanel agentName={agentName} />
      <TopPredictionPanel agentName={agentName} />

      <div className="rounded-xl border p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm opacity-70">Marketing Score</div>

          <button
            type="button"
            className="rounded-md border px-2 py-1 text-sm"
            onClick={() => void refreshAll()}
            disabled={msLoading || loading}
          >
            {msLoading || loading ? "Refresh…" : "Refresh"}
          </button>
        </div>

        {msErr ? <div className="mt-2 text-sm text-red-600">{msErr}</div> : null}

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-lg bg-black/5 p-3">
            <div className="text-xs opacity-70">Score</div>
            <div className="mt-1 text-2xl font-semibold">{fmtScore(marketingScore)} / 5</div>
            <div className="text-xs opacity-70">n={n}</div>
          </div>

          <div className="rounded-lg bg-black/5 p-3 lg:col-span-2">
            <div className="text-xs opacity-70">Breakdown</div>

            {marketingBreakdown.length === 0 ? (
              <div className="mt-2 text-sm opacity-70">Aucun impact scoré (pas de measurements).</div>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {marketingBreakdown.map((b) => (
                  <div key={b.impactId} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {b.metric} • {b.actionType}
                      </div>
                      <div className="text-xs opacity-70">
                        weight={b.weight} • points={b.pointsCount} • status={b.status ?? "—"}
                      </div>
                      {b.error ? <div className="text-xs text-red-600">{b.error}</div> : null}
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold">
                        {fmtScore(b.score?.compositeScore ?? 0)} / 5
                      </div>
                      <div className="text-xs opacity-70">
                        baseline {b.baselineValue} → {b.postValue ?? "—"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedImpactScore ? (
          <div className="mt-3 text-xs opacity-70">
            Impact sélectionné score:{" "}
            <span className="font-mono">
              {fmtScore(selectedImpactScore.score?.compositeScore ?? 0)}
            </span>{" "}
            • points: <span className="font-mono">{selectedImpactScore.pointsCount}</span>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm opacity-70">Trajectory</div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <button
              className="rounded-md border px-2 py-1 text-sm"
              onClick={() => setShowCreate((v) => !v)}
              type="button"
            >
              {showCreate ? "Fermer" : "Créer un impact"}
            </button>

            {impacts.length > 0 ? (
              <div className="flex items-center gap-2">
                <div className="text-xs opacity-70">Impact</div>
                <select
                  className="rounded-md border px-2 py-1 text-sm"
                  value={selectedImpactId}
                  onChange={(e) => setSelectedImpactId(e.target.value)}
                >
                  {impacts.map((i) => (
                    <option key={i.id} value={i.id}>
                      {labelForImpact(i)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>

        {showCreate ? (
          <div className="mt-3 rounded-lg bg-black/5 p-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs opacity-70">metric</label>
                <input
                  className="rounded-md border px-2 py-1 text-sm"
                  value={createMetric}
                  onChange={(e) => setCreateMetric(e.target.value)}
                  placeholder="followers / leads / visits / revenue"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs opacity-70">actionType</label>
                <input
                  className="rounded-md border px-2 py-1 text-sm"
                  value={createActionType}
                  onChange={(e) => setCreateActionType(e.target.value)}
                  placeholder="instagram_campaign"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs opacity-70">baseline</label>
                <input
                  className="rounded-md border px-2 py-1 text-sm"
                  type="number"
                  value={createBaseline}
                  onChange={(e) => setCreateBaseline(Number(e.target.value))}
                  min={1}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs opacity-70">status</label>
                <input
                  className="rounded-md border px-2 py-1 text-sm"
                  value={createStatus}
                  onChange={(e) => setCreateStatus(e.target.value)}
                  placeholder="active"
                />
              </div>
            </div>

            {createErr ? <div className="mt-2 text-sm text-red-600">{createErr}</div> : null}

            <div className="mt-3 flex gap-2">
              <button
                className="rounded-md border px-3 py-1 text-sm"
                onClick={onCreateImpact}
                disabled={creating}
                type="button"
              >
                {creating ? "Création…" : "Créer"}
              </button>

              <button
                className="rounded-md border px-3 py-1 text-sm"
                onClick={() => setShowCreate(false)}
                disabled={creating}
                type="button"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : null}

        {impacts.length === 0 ? (
          <div className="mt-3 text-sm opacity-70">
            Aucun impact marketing trouvé pour cet agent. Crée-en un pour démarrer une trajectoire.
          </div>
        ) : null}

        {selectedImpact ? (
          <>
            <div className="mt-2 text-xs opacity-70">
              status: <span className="font-mono">{selectedImpact.status}</span> • impactId:{" "}
              <span className="font-mono">{selectedImpact.id}</span>
            </div>

            <div className="mt-3">
              <button
                className="rounded-md border px-2 py-1 text-sm"
                type="button"
                onClick={() => setShowMeasure((v) => !v)}
              >
                {showMeasure ? "Fermer mesure" : "Add measurement"}
              </button>
            </div>

            {showMeasure ? (
              <div className="mt-3 rounded-lg bg-black/5 p-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs opacity-70">postValue</label>
                    <input
                      className="rounded-md border px-2 py-1 text-sm"
                      type="number"
                      value={measureValue}
                      onChange={(e) => setMeasureValue(Number(e.target.value))}
                    />
                  </div>

                  <button
                    className="rounded-md border px-3 py-1 text-sm"
                    type="button"
                    onClick={onAddMeasurement}
                    disabled={measuring}
                  >
                    {measuring ? "Saving…" : "Save measurement"}
                  </button>
                </div>

                {measureErr ? <div className="mt-2 text-sm text-red-600">{measureErr}</div> : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {selectedImpactId ? <TrajectorySummaryPanel impactId={selectedImpactId} n={n} /> : null}

      {selectedImpactScore && selectedImpactScore.score ? (
        <DecisionPanel
          agentName={agentName}
          score={{
            baseline: selectedImpactScore.score.baseline,
            current: selectedImpactScore.score.current,
            growth: selectedImpactScore.score.growth,
            momentum: selectedImpactScore.score.momentum,
            stability: selectedImpactScore.score.stability,
            compositeScore: selectedImpactScore.score.compositeScore,
          }}
          pointsCount={selectedImpactScore.pointsCount}
        />
      ) : null}
    </div>
  );
}