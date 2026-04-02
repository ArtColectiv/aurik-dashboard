"use client";

import {
  blockedByLabel,
  confidenceClasses,
  decisionClasses,
  deriveDebug,
  deriveDecision,
  fmtNumber,
  fmtPct,
  formatDateTime,
  formatDurationMs,
  riskClasses,
} from "./autonomyPanelShared";
import { useTopPredictionRuntime } from "./useTopPredictionRuntime";

function predictionHeadline(params: {
  decision: "auto_run" | "safe_override" | "no_action";
  reason: string;
}) {
  const { decision, reason } = params;

  if (decision === "auto_run") {
    return "This is the strongest candidate for standard autonomous execution.";
  }

  if (decision === "safe_override") {
    return "This is the strongest candidate for controlled low-risk exploration.";
  }

  return reason;
}

function summaryTone(kind: "opportunity" | "decision" | "risk" | "neutral") {
  if (kind === "opportunity") {
    return "border-green-200 bg-green-50";
  }

  if (kind === "decision") {
    return "border-blue-200 bg-blue-50";
  }

  if (kind === "risk") {
    return "border-amber-200 bg-amber-50";
  }

  return "border-slate-200 bg-slate-50";
}

export default function TopPredictionPanel(props: { agentName: string }) {
  const { agentName } = props;

  const {
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
  } = useTopPredictionRuntime(agentName);

  const topDecision =
    topPrediction !== null
      ? deriveDecision(topPrediction, statsMap[topPrediction.experimentKey] ?? null)
      : null;

  const topDebug =
    topPrediction !== null
      ? deriveDebug(topPrediction, statsMap[topPrediction.experimentKey] ?? null)
      : null;

  const runtimeResult =
    autonomyResp?.ok === true && autonomyResp.result.ok === true
      ? autonomyResp.result
      : null;

  const runtimeDebug = runtimeResult?.debug;

  const displayedDecision = autonomyResp?.ok
    ? autonomyResp.decision
    : topDecision?.decision ?? "no_action";

  const displayedRisk = autonomyResp?.ok
    ? autonomyResp.riskLevel
    : topDecision?.riskLevel ?? "low";

  const displayedReason =
    autonomyResp?.ok
      ? autonomyResp.reason
      : topDecision?.reason ?? "No autonomy interpretation available";

  const displayedAutoRunEligible =
    runtimeDebug?.autoRunEligible ?? topDebug?.autoRunEligible;

  const headline = predictionHeadline({
    decision: displayedDecision,
    reason: displayedReason,
  });

  const blockedBy: string[] =
    runtimeDebug?.blockedBy && runtimeDebug.blockedBy.length > 0
      ? runtimeDebug.blockedBy
      : topDebug?.blockedBy ?? [];

  const manualRunMessageClass =
    manualRunTone === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : manualRunTone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : manualRunTone === "neutral"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm opacity-70">Top Prediction</div>
          <div className="mt-1 text-lg font-semibold">
            Best next experiment candidate
          </div>
          <div className="mt-1 text-sm opacity-70">{headline}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-sm"
            onClick={() => void fetchPredictions()}
            disabled={loading || manualRunLoading}
          >
            {loading ? "Refresh…" : "Refresh"}
          </button>

          <button
            type="button"
            className="rounded-md border border-black bg-black px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void runExperimentManually()}
            disabled={manualRunLoading}
          >
            {manualRunLoading ? "Running…" : "Run experiment"}
          </button>
        </div>
      </div>

      {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}

      {manualRunMessage ? (
        <div
          className={`mt-3 whitespace-pre-line rounded-md border px-3 py-2 text-sm ${manualRunMessageClass}`}
        >
          {manualRunMessage}
        </div>
      ) : null}

      {!err && !topPrediction && !loading ? (
        <div className="mt-4 text-sm opacity-70">No prediction available yet.</div>
      ) : null}

      {topPrediction ? (
        <div className="mt-4 flex flex-col gap-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs opacity-70">Best next experiment</div>
            <div className="mt-1 text-lg font-semibold">
              {topPrediction.experimentKey}
            </div>
            <div className="mt-2 text-sm opacity-80">{headline}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div
              className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${confidenceClasses(
                topPrediction.confidence
              )}`}
            >
              confidence: {topPrediction.confidence}
            </div>

            <div
              className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${decisionClasses(
                displayedDecision
              )}`}
            >
              decision: {displayedDecision}
            </div>

            <div
              className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${riskClasses(
                displayedRisk
              )}`}
            >
              risk: {displayedRisk}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <div className={`rounded-lg border p-3 ${summaryTone("opportunity")}`}>
              <div className="text-xs opacity-70">Expected lift</div>
              <div className="mt-1 text-2xl font-semibold">
                {fmtPct(topPrediction.expectedLiftPct)}
              </div>
              <div className="mt-1 text-xs opacity-70">
                Modeled opportunity size for the best candidate
              </div>
            </div>

            <div className={`rounded-lg border p-3 ${summaryTone("decision")}`}>
              <div className="text-xs opacity-70">Decision</div>
              <div className="mt-1 text-2xl font-semibold">
                {displayedDecision}
              </div>
              <div className="mt-1 text-xs opacity-70">
                Current autonomy recommendation
              </div>
            </div>

            <div className={`rounded-lg border p-3 ${summaryTone("risk")}`}>
              <div className="text-xs opacity-70">Risk level</div>
              <div className="mt-1 text-2xl font-semibold">{displayedRisk}</div>
              <div className="mt-1 text-xs opacity-70">
                Execution risk classification
              </div>
            </div>

            <div className={`rounded-lg border p-3 ${summaryTone("neutral")}`}>
              <div className="text-xs opacity-70">Prediction score</div>
              <div className="mt-1 text-2xl font-semibold">
                {topPrediction.predictionScore.toFixed(2)}
              </div>
              <div className="mt-1 text-xs opacity-70">
                Relative priority among candidates
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="text-xs opacity-70">Runtime execution guardrails</div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
              <div className="rounded-md border border-blue-200 bg-white/70 p-3">
                <div className="text-xs opacity-70">Currently running</div>
                <div className="mt-1 text-lg font-semibold">
                  {runtimeDebug?.alreadyRunning === undefined
                    ? "—"
                    : runtimeDebug.alreadyRunning
                    ? "Yes"
                    : "No"}
                </div>
              </div>

              <div className="rounded-md border border-blue-200 bg-white/70 p-3">
                <div className="text-xs opacity-70">Cooldown status</div>
                <div className="mt-1 text-lg font-semibold">
                  {runtimeDebug?.cooldownActive === undefined
                    ? "—"
                    : runtimeDebug.cooldownActive
                    ? "Active"
                    : "Inactive"}
                </div>
              </div>

              <div className="rounded-md border border-blue-200 bg-white/70 p-3">
                <div className="text-xs opacity-70">Cooldown remaining</div>
                <div className="mt-1 text-lg font-semibold">
                  {formatDurationMs(runtimeDebug?.cooldownRemainingMs)}
                </div>
              </div>

              <div className="rounded-md border border-blue-200 bg-white/70 p-3">
                <div className="text-xs opacity-70">Last started at</div>
                <div className="mt-1 text-sm font-medium">
                  {formatDateTime(runtimeDebug?.latestStartedAt)}
                </div>
              </div>
            </div>

            <div className="mt-3 text-sm opacity-80">
              Prediction priority and runtime execution are intentionally separated.
              A candidate can remain the best opportunity while being temporarily blocked
              by active guardrails.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs opacity-70">Runs</div>
              <div className="mt-1 text-lg font-semibold">
                {statsMap[topPrediction.experimentKey]?.runs ?? 0}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs opacity-70">Successes</div>
              <div className="mt-1 text-lg font-semibold">
                {statsMap[topPrediction.experimentKey]?.successCount ?? 0}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs opacity-70">Neutrals</div>
              <div className="mt-1 text-lg font-semibold">
                {statsMap[topPrediction.experimentKey]?.neutralCount ?? 0}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs opacity-70">Failures</div>
              <div className="mt-1 text-lg font-semibold">
                {statsMap[topPrediction.experimentKey]?.failureCount ?? 0}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs opacity-70">Interpretation</div>
            <div className="mt-1 text-sm">{displayedReason}</div>
          </div>

          <div className="rounded-lg border border-black/10 bg-black/5 p-3">
            <div className="text-xs opacity-70">Autonomy debug</div>

            <div className="mt-2 grid grid-cols-1 gap-2 text-sm lg:grid-cols-4">
              <div>
                <div className="opacity-60">Confidence</div>
                <div className="font-medium">
                  {runtimeDebug?.confidence ?? topDebug?.confidence ?? "—"}
                </div>
              </div>

              <div>
                <div className="opacity-60">Total runs</div>
                <div className="font-medium">
                  {runtimeDebug?.totalRuns ?? topDebug?.totalRuns ?? "—"}
                </div>
              </div>

              <div>
                <div className="opacity-60">Success rate</div>
                <div className="font-medium">
                  {fmtPct(runtimeDebug?.successRate ?? topDebug?.successRate)}
                </div>
              </div>

              <div>
                <div className="opacity-60">Failure rate</div>
                <div className="font-medium">
                  {fmtPct(runtimeDebug?.failureRate ?? topDebug?.failureRate)}
                </div>
              </div>

              <div>
                <div className="opacity-60">Neutral rate</div>
                <div className="font-medium">
                  {fmtPct(runtimeDebug?.neutralRate ?? topDebug?.neutralRate)}
                </div>
              </div>

              <div>
                <div className="opacity-60">Expected lift</div>
                <div className="font-medium">
                  {fmtPct(runtimeDebug?.expectedLiftPct ?? topDebug?.expectedLiftPct)}
                </div>
              </div>

              <div>
                <div className="opacity-60">Prediction score</div>
                <div className="font-medium">
                  {fmtNumber(runtimeDebug?.predictionScore ?? topDebug?.predictionScore)}
                </div>
              </div>

              <div>
                <div className="opacity-60">Auto-run eligible</div>
                <div className="font-medium">
                  {displayedAutoRunEligible === undefined
                    ? "—"
                    : displayedAutoRunEligible
                    ? "yes"
                    : "no"}
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-md bg-white/70 p-2 text-sm">
              <div className="opacity-60">Auto-run reason</div>
              <div className="mt-1">
                {runtimeDebug?.autoRunReason ?? topDebug?.autoRunReason ?? "—"}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-sm opacity-60">Blocked by</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {blockedBy.length > 0 ? (
                  blockedBy.map((item: string) => (
                    <div
                      key={`${topPrediction.experimentKey}-${item}`}
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

          {predictions.length > 1 ? (
            <div className="rounded-lg border border-slate-200 bg-black/5 p-3">
              <div className="text-xs opacity-70">Other predictions</div>

              <div className="mt-3 flex flex-col gap-2">
                {predictions.slice(1).map((prediction) => {
                  const stat = statsMap[prediction.experimentKey] ?? null;
                  const decision = deriveDecision(prediction, stat);

                  return (
                    <div
                      key={prediction.experimentKey}
                      className="rounded-lg border border-black/10 bg-white/80 p-3"
                    >
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {prediction.experimentKey}
                          </div>

                          <div className="mt-1 flex flex-wrap gap-2">
                            <div
                              className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium ${confidenceClasses(
                                prediction.confidence
                              )}`}
                            >
                              confidence: {prediction.confidence}
                            </div>

                            <div
                              className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium ${decisionClasses(
                                decision.decision
                              )}`}
                            >
                              {decision.decision}
                            </div>
                          </div>

                          <div className="mt-1 text-xs opacity-70">
                            {decision.reason}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="text-sm font-medium">
                            {fmtPct(prediction.expectedLiftPct)}
                          </div>
                          <div className="text-xs opacity-70">
                            score: {prediction.predictionScore.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}