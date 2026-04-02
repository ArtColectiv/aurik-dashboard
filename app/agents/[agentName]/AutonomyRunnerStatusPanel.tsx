"use client";

import { useEffect, useState } from "react";
import {
  type LastCycleResp,
  type RunnerResult,
  cycleStatusClass,
  resultBadgeClass,
  resultBadgeLabel,
  riskClasses,
  blockedByLabel,
  formatDateTime,
  fmtPct,
  fmtNumber,
} from "./autonomyPanelShared";

function cycleHeadline(params: {
  failedAgents: number;
  experimentsTriggered: number;
  safeOverrideRuns: number;
  noActionCount: number;
}) {
  const { failedAgents, experimentsTriggered, safeOverrideRuns, noActionCount } = params;

  if (failedAgents > 0) {
    return "Some agents failed during the autonomy cycle.";
  }

  if (safeOverrideRuns > 0) {
    return "Aurik used controlled safe overrides to continue low-risk learning.";
  }

  if (experimentsTriggered > 0) {
    return "Aurik triggered standard autonomous experiments this cycle.";
  }

  if (noActionCount > 0) {
    return "Aurik reviewed all agents and chose not to trigger new experiments.";
  }

  return "No autonomy activity detected yet.";
}

function summaryCardTone(kind: "triggered" | "safe" | "idle" | "failed") {
  if (kind === "triggered") {
    return "border-green-200 bg-green-50";
  }

  if (kind === "safe") {
    return "border-amber-200 bg-amber-50";
  }

  if (kind === "failed") {
    return "border-red-200 bg-red-50";
  }

  return "border-slate-200 bg-slate-50";
}

export default function AutonomyRunnerStatusPanel() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastCycle, setLastCycle] = useState<{
    id: string;
    agent_name: string;
    event_type: string;
    payload: {
      agentsChecked?: number;
      experimentsTriggered?: number;
      normalAutoRuns?: number;
      safeOverrideRuns?: number;
      noActionCount?: number;
      failedAgents?: number;
      durationMs?: number;
      results?: RunnerResult[];
    } | null;
    created_at: string;
  } | null>(null);

  async function fetchLastCycle() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/internal/autonomy-runner-last-cycle", {
        cache: "no-store",
      });

      const json = (await res.json()) as LastCycleResp;

      if (!json.ok) {
        setErr(json.error);
        setLastCycle(null);
        return;
      }

      setLastCycle(json.lastCycle ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
      setLastCycle(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchLastCycle();
  }, []);

  const payload = lastCycle?.payload ?? null;
  const agentsChecked = payload?.agentsChecked ?? 0;
  const experimentsTriggered = payload?.experimentsTriggered ?? 0;
  const normalAutoRuns = payload?.normalAutoRuns ?? 0;
  const safeOverrideRuns = payload?.safeOverrideRuns ?? 0;
  const noActionCount = payload?.noActionCount ?? 0;
  const failedAgents = payload?.failedAgents ?? 0;
  const durationMs = payload?.durationMs ?? 0;
  const results = payload?.results ?? [];

  const headline = cycleHeadline({
    failedAgents,
    experimentsTriggered,
    safeOverrideRuns,
    noActionCount,
  });

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm opacity-70">Autonomy Runner</div>
          <div className="mt-1 text-lg font-semibold">Autonomous cycle overview</div>
          <div className="mt-1 text-sm opacity-70">{headline}</div>
        </div>

        <button
          type="button"
          className="rounded-md border px-2 py-1 text-sm"
          onClick={() => void fetchLastCycle()}
          disabled={loading}
        >
          {loading ? "Refresh…" : "Refresh"}
        </button>
      </div>

      {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}

      {!err && !lastCycle && !loading ? (
        <div className="mt-4 text-sm opacity-70">No runner cycle found yet.</div>
      ) : null}

      {lastCycle ? (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <div
              className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${cycleStatusClass(
                failedAgents,
                experimentsTriggered,
                safeOverrideRuns
              )}`}
            >
              cycle:{" "}
              {failedAgents > 0
                ? "issues"
                : safeOverrideRuns > 0
                ? "controlled override"
                : experimentsTriggered > 0
                ? "active"
                : "review only"}
            </div>

            <div className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
              last run: {formatDateTime(lastCycle.created_at)}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <div className={`rounded-lg border p-3 ${summaryCardTone("idle")}`}>
              <div className="text-xs opacity-70">Agents reviewed</div>
              <div className="mt-1 text-2xl font-semibold">{agentsChecked}</div>
              <div className="mt-1 text-xs opacity-70">Agents scanned in this cycle</div>
            </div>

            <div className={`rounded-lg border p-3 ${summaryCardTone("triggered")}`}>
              <div className="text-xs opacity-70">Experiments triggered</div>
              <div className="mt-1 text-2xl font-semibold">{experimentsTriggered}</div>
              <div className="mt-1 text-xs opacity-70">Total experiments launched</div>
            </div>

            <div className={`rounded-lg border p-3 ${summaryCardTone("safe")}`}>
              <div className="text-xs opacity-70">Safe overrides</div>
              <div className="mt-1 text-2xl font-semibold">{safeOverrideRuns}</div>
              <div className="mt-1 text-xs opacity-70">
                Controlled bootstrap / exploration runs
              </div>
            </div>

            <div className={`rounded-lg border p-3 ${summaryCardTone("failed")}`}>
              <div className="text-xs opacity-70">Failed agents</div>
              <div className="mt-1 text-2xl font-semibold">{failedAgents}</div>
              <div className="mt-1 text-xs opacity-70">Agents that errored this cycle</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs opacity-70">Normal auto-runs</div>
              <div className="mt-1 text-lg font-semibold">{normalAutoRuns}</div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs opacity-70">No action</div>
              <div className="mt-1 text-lg font-semibold">{noActionCount}</div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs opacity-70">Duration</div>
              <div className="mt-1 text-lg font-semibold">{durationMs} ms</div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs opacity-70">Cycle mode</div>
              <div className="mt-1 text-lg font-semibold">
                {safeOverrideRuns > 0
                  ? "Progressive"
                  : experimentsTriggered > 0
                  ? "Autonomous"
                  : "Observational"}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs opacity-70">Interpretation</div>
            <div className="mt-1 text-sm">
              {failedAgents > 0
                ? "Some agents encountered runtime issues and should be reviewed before broader autonomy is enabled."
                : safeOverrideRuns > 0
                ? "Aurik detected a low-risk learning opportunity and launched a controlled confirmation experiment."
                : experimentsTriggered > 0
                ? "Aurik found enough confidence to trigger standard autonomous experimentation."
                : "Aurik completed a review cycle but found no candidate strong enough to launch automatically."}
            </div>
          </div>

          {results.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-black/5 p-3">
              <div className="text-xs opacity-70">Detailed agent outcomes</div>

              <div className="mt-3 flex flex-col gap-2">
                {results.map((result, index) => (
                  <div
                    key={`${result.agentName}-${index}`}
                    className="rounded-lg border border-black/10 bg-white/80 p-3"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-sm font-medium">{result.agentName}</div>

                            <div
                              className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium ${resultBadgeClass(
                                result
                              )}`}
                            >
                              {resultBadgeLabel(result)}
                            </div>

                            {result.riskLevel ? (
                              <div
                                className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium ${riskClasses(
                                  result.riskLevel
                                )}`}
                              >
                                risk: {result.riskLevel}
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-1 text-xs opacity-70">
                            {result.ok
                              ? `action: ${result.action ?? "none"}`
                              : `error: ${result.error ?? "Unknown error"}`}
                          </div>

                          {result.experimentKey ? (
                            <div className="mt-1 text-xs opacity-70">
                              experiment: {result.experimentKey}
                            </div>
                          ) : null}
                        </div>

                        <div className="max-w-xl text-xs opacity-70 lg:text-right">
                          {result.ok
                            ? result.reason ?? "—"
                            : result.error ?? "Unknown error"}
                        </div>
                      </div>

                      {result.debug ? (
                        <div className="rounded-lg border border-black/10 bg-black/5 p-3">
                          <div className="text-xs opacity-70">Autonomy debug</div>

                          <div className="mt-2 grid grid-cols-1 gap-2 text-sm lg:grid-cols-4">
                            <div>
                              <div className="opacity-60">Confidence</div>
                              <div className="font-medium">{result.debug.confidence ?? "—"}</div>
                            </div>

                            <div>
                              <div className="opacity-60">Total runs</div>
                              <div className="font-medium">
                                {result.debug.totalRuns ?? "—"}
                              </div>
                            </div>

                            <div>
                              <div className="opacity-60">Success rate</div>
                              <div className="font-medium">
                                {fmtPct(result.debug.successRate)}
                              </div>
                            </div>

                            <div>
                              <div className="opacity-60">Failure rate</div>
                              <div className="font-medium">
                                {fmtPct(result.debug.failureRate)}
                              </div>
                            </div>

                            <div>
                              <div className="opacity-60">Neutral rate</div>
                              <div className="font-medium">
                                {fmtPct(result.debug.neutralRate)}
                              </div>
                            </div>

                            <div>
                              <div className="opacity-60">Expected lift</div>
                              <div className="font-medium">
                                {fmtPct(result.debug.expectedLiftPct)}
                              </div>
                            </div>

                            <div>
                              <div className="opacity-60">Prediction score</div>
                              <div className="font-medium">
                                {fmtNumber(result.debug.predictionScore)}
                              </div>
                            </div>

                            <div>
                              <div className="opacity-60">Auto-run eligible</div>
                              <div className="font-medium">
                                {result.debug.autoRunEligible === undefined
                                  ? "—"
                                  : result.debug.autoRunEligible
                                  ? "yes"
                                  : "no"}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2 text-sm lg:grid-cols-2">
                            <div className="rounded-md bg-white/70 p-2">
                              <div className="opacity-60">Auto-run reason</div>
                              <div className="mt-1">
                                {result.debug.autoRunReason ?? "—"}
                              </div>
                            </div>

                            <div className="rounded-md bg-white/70 p-2">
                              <div className="opacity-60">Running started at</div>
                              <div className="mt-1">
                                {formatDateTime(result.debug.runningStartedAt)}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="text-sm opacity-60">Blocked by</div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {(result.debug.blockedBy ?? []).length > 0 ? (
                                result.debug.blockedBy?.map((item) => (
                                  <div
                                    key={`${result.agentName}-${item}`}
                                    className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                                  >
                                    {blockedByLabel(item)}
                                  </div>
                                ))
                              ) : (
                                <div className="inline-flex items-center rounded-md border border-green-200 bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                  no blockers
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}