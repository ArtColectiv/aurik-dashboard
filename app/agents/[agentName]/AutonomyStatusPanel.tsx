"use client";

import {
  blockedByLabel,
  formatDateTime,
  formatDurationMs,
  fmtPct,
} from "./autonomyPanelShared";
import { useAutonomyStatus } from "./useAutonomyStatus";

function decisionClass(
  decision: "auto_run" | "safe_override" | "no_action"
) {
  if (decision === "auto_run") {
    return "border-green-200 bg-green-50 text-green-800";
  }

  if (decision === "safe_override") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function riskClass(risk: "low" | "medium") {
  if (risk === "low") {
    return "border-green-200 bg-green-50 text-green-800";
  }

  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default function AutonomyStatusPanel(props: {
  agentName: string;
}) {
  const { agentName } = props;

  const { loading, error, autonomy, refresh } =
    useAutonomyStatus(agentName);

  const response = autonomy?.ok ? autonomy : null;
  const result =
    response?.result && response.result.ok ? response.result : null;
  const debug = result?.debug;
  const blockedBy = debug?.blockedBy ?? [];

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm opacity-70">Autonomy status</div>
          <div className="text-lg font-semibold">
            Real-time execution state
          </div>
        </div>

        <button
          className="rounded-md border px-2 py-1 text-sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mt-3 text-sm text-red-600">{error}</div>
      ) : null}

      {!response && !loading && !error ? (
        <div className="mt-3 text-sm opacity-70">
          No autonomy data available.
        </div>
      ) : null}

      {response ? (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <div
              className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${decisionClass(
                response.decision
              )}`}
            >
              decision: {response.decision}
            </div>

            <div
              className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${riskClass(
                response.riskLevel
              )}`}
            >
              risk: {response.riskLevel}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs opacity-70">Reason</div>
            <div className="mt-1 text-sm">{response.reason}</div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="text-xs opacity-70">
              Execution guardrails
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-md bg-white/70 p-2">
                <div className="text-xs opacity-60">
                  Already running
                </div>
                <div className="font-medium">
                  {debug?.alreadyRunning ? "Yes" : "No"}
                </div>
              </div>

              <div className="rounded-md bg-white/70 p-2">
                <div className="text-xs opacity-60">
                  Cooldown active
                </div>
                <div className="font-medium">
                  {debug?.cooldownActive ? "Yes" : "No"}
                </div>
              </div>

              <div className="rounded-md bg-white/70 p-2">
                <div className="text-xs opacity-60">
                  Cooldown remaining
                </div>
                <div className="font-medium">
                  {formatDurationMs(debug?.cooldownRemainingMs)}
                </div>
              </div>

              <div className="rounded-md bg-white/70 p-2">
                <div className="text-xs opacity-60">Last started</div>
                <div className="text-sm font-medium">
                  {formatDateTime(debug?.latestStartedAt)}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs opacity-70">Blocked by</div>

            <div className="mt-2 flex flex-wrap gap-2">
              {blockedBy.length > 0 ? (
                blockedBy.map((item) => (
                  <div
                    key={item}
                    className="rounded-md border bg-slate-100 px-2 py-1 text-xs"
                  >
                    {blockedByLabel(item)}
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-green-200 bg-green-100 px-2 py-1 text-xs text-green-800">
                  No blockers
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-black/10 bg-black/5 p-3">
            <div className="text-xs opacity-70">Debug metrics</div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
              <div>
                <div className="opacity-60">Confidence</div>
                <div className="font-medium">
                  {debug?.confidence ?? "—"}
                </div>
              </div>

              <div>
                <div className="opacity-60">Runs</div>
                <div className="font-medium">
                  {debug?.totalRuns ?? "—"}
                </div>
              </div>

              <div>
                <div className="opacity-60">Success rate</div>
                <div className="font-medium">
                  {fmtPct(debug?.successRate)}
                </div>
              </div>

              <div>
                <div className="opacity-60">Failure rate</div>
                <div className="font-medium">
                  {fmtPct(debug?.failureRate)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}