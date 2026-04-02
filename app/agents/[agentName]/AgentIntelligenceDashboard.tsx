"use client";

import { useEffect, useMemo, useState } from "react";
import { blockedByLabel, fmtPct } from "./autonomyPanelShared";
import { useAgentInsights } from "./AgentInsightsContext";

type Props = {
  agentId: string;
  agentSlug: string;
  initialScore: number;
  initialExperience: number;
};

type AgentScoreV1Response =
  | {
      ok: true;
      score?: {
        value?: number;
      };
      computedScore?: number;
      scoreValue?: number;
    }
  | {
      ok: false;
      error?: string;
      message?: string;
    };

function statusBadgeClass(status: "autonomous" | "learning" | "blocked") {
  if (status === "autonomous") {
    return "border-green-200 bg-green-50 text-green-800";
  }

  if (status === "learning") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function autonomyBadgeClass(
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

function intelligenceBadgeClass(
  level: "Emerging" | "Learning" | "Operational" | "Autonomous"
) {
  if (level === "Autonomous") {
    return "border-green-200 bg-green-50 text-green-800";
  }

  if (level === "Operational") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  if (level === "Learning") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function nextStepClass(priority: "high" | "medium" | "low") {
  if (priority === "high") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (priority === "medium") {
    return "border-blue-200 bg-blue-50 text-blue-900";
  }

  return "border-green-200 bg-green-50 text-green-900";
}

function valuePotentialClass(level: "low" | "moderate" | "high") {
  if (level === "high") {
    return "border-green-200 bg-green-50 text-green-900";
  }

  if (level === "moderate") {
    return "border-blue-200 bg-blue-50 text-blue-900";
  }

  return "border-slate-200 bg-slate-50 text-slate-800";
}

function whyNotNowClass(severity: "none" | "medium" | "high") {
  if (severity === "high") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (severity === "medium") {
    return "border-blue-200 bg-blue-50 text-blue-900";
  }

  return "border-green-200 bg-green-50 text-green-900";
}

function unlockClass(state: "ready" | "progressing" | "blocked") {
  if (state === "ready") {
    return "border-green-200 bg-green-50 text-green-900";
  }

  if (state === "progressing") {
    return "border-blue-200 bg-blue-50 text-blue-900";
  }

  return "border-slate-200 bg-slate-50 text-slate-800";
}

function prettyDecision(
  decision: "auto_run" | "safe_override" | "no_action"
): string {
  if (decision === "auto_run") return "Auto-run";
  if (decision === "safe_override") return "Safe override";
  return "No action";
}

function deriveGlobalStatus(params: {
  decision: "auto_run" | "safe_override" | "no_action";
  blockedBy: string[];
  topPredictionExists: boolean;
}): "autonomous" | "learning" | "blocked" {
  const { decision, blockedBy, topPredictionExists } = params;

  if (decision === "auto_run") {
    return "autonomous";
  }

  if (decision === "safe_override") {
    return "learning";
  }

  if (topPredictionExists || blockedBy.length > 0) {
    return "blocked";
  }

  return "learning";
}

function prettyGlobalStatus(
  status: "autonomous" | "learning" | "blocked"
): string {
  if (status === "autonomous") return "Autonomous";
  if (status === "learning") return "Learning";
  return "Blocked";
}

function deriveIntelligenceLevel(params: {
  score: number;
  experience: number;
  decision: "auto_run" | "safe_override" | "no_action";
}): "Emerging" | "Learning" | "Operational" | "Autonomous" {
  const { score, experience, decision } = params;

  if (decision === "auto_run" && score >= 70 && experience >= 20) {
    return "Autonomous";
  }

  if (decision === "safe_override" || (score >= 50 && experience >= 10)) {
    return "Operational";
  }

  if (score >= 25 || experience >= 5) {
    return "Learning";
  }

  return "Emerging";
}

function intelligenceSummary(
  level: "Emerging" | "Learning" | "Operational" | "Autonomous"
) {
  if (level === "Autonomous") {
    return "Agent can operate with strong autonomy signals and controlled execution readiness.";
  }

  if (level === "Operational") {
    return "Agent shows repeatable decision quality and is approaching reliable execution maturity.";
  }

  if (level === "Learning") {
    return "Agent is building evidence, patterns, and execution confidence.";
  }

  return "Agent is in early-stage learning and still accumulating useful operational evidence.";
}

function deriveRecommendedNextStep(params: {
  decision: "auto_run" | "safe_override" | "no_action";
  blockedBy: string[];
  topPredictionKey: string | null;
}): {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
} {
  const { decision, blockedBy, topPredictionKey } = params;
  const experimentLabel = topPredictionKey ?? "the top experiment";

  if (decision === "auto_run") {
    return {
      title: "Run the top experiment",
      detail: `${experimentLabel} is eligible for standard autonomous execution.`,
      priority: "low",
    };
  }

  if (decision === "safe_override") {
    return {
      title: "Approve a controlled confirmation run",
      detail: `${experimentLabel} qualifies for a low-risk manual confirmation cycle.`,
      priority: "medium",
    };
  }

  if (blockedBy.includes("cooldown_active")) {
    return {
      title: "Wait for cooldown to expire",
      detail: `${experimentLabel} is temporarily protected by execution cooldown.`,
      priority: "medium",
    };
  }

  if (blockedBy.includes("already_running")) {
    return {
      title: "Let the active run finish",
      detail: `${experimentLabel} is already in progress and should complete before re-triggering.`,
      priority: "medium",
    };
  }

  if (
    blockedBy.includes("safe_override_requires_min_3_runs") ||
    blockedBy.includes("bootstrap_safe_override_requires_min_1_run")
  ) {
    return {
      title: "Accumulate more experiment evidence",
      detail: `Run additional cycles for ${experimentLabel} to improve confidence and decision quality.`,
      priority: "high",
    };
  }

  if (
    blockedBy.includes("bootstrap_safe_override_requires_neutral_rate_eq_1") ||
    blockedBy.includes("safe_override_requires_neutral_rate_gte_0_6") ||
    blockedBy.includes("safe_override_requires_zero_failures")
  ) {
    return {
      title: "Improve experiment consistency",
      detail: `Refine ${experimentLabel} until outcomes are more stable and lower risk.`,
      priority: "high",
    };
  }

  if (blockedBy.includes("safe_override_requires_low_confidence")) {
    return {
      title: "Promote the candidate to stronger confidence",
      detail: `Generate clearer evidence so ${experimentLabel} can move from weak confidence toward execution readiness.`,
      priority: "high",
    };
  }

  if (blockedBy.includes("missing_experiment_history")) {
    return {
      title: "Create first experiment history",
      detail: "Run an initial experiment so the agent can begin learning from real outcomes.",
      priority: "high",
    };
  }

  if (blockedBy.includes("missing_impact")) {
    return {
      title: "Create an impact target first",
      detail: "The agent needs a live impact to connect decisions to measurable outcomes.",
      priority: "high",
    };
  }

  return {
    title: "Continue guided learning",
    detail: "Collect more outcome data and let the agent improve its next decision quality.",
    priority: "medium",
  };
}

function deriveValueAtAGlance(params: {
  score: number;
  experience: number;
  intelligenceLevel: "Emerging" | "Learning" | "Operational" | "Autonomous";
  decision: "auto_run" | "safe_override" | "no_action";
}) {
  const { score, intelligenceLevel, decision } = params;

  let performance = "Low performance signal";
  if (score >= 70) {
    performance = "Strong performance signal";
  } else if (score >= 40) {
    performance = "Moderate performance signal";
  }

  let readiness = "Not ready for execution";
  if (decision === "auto_run") {
    readiness = "Ready for autonomous execution";
  } else if (decision === "safe_override") {
    readiness = "Ready for controlled execution";
  }

  let unlock = "Continue learning to unlock execution";
  if (intelligenceLevel === "Operational") {
    unlock = "Reach stable outcomes to unlock autonomy";
  }
  if (intelligenceLevel === "Autonomous") {
    unlock = "Scale successful experiments";
  }

  return {
    performance,
    readiness,
    unlock,
  };
}

function derivePotentialValueUnlocked(expectedLiftPct: number | null): {
  level: "low" | "moderate" | "high";
  headline: string;
  detail: string;
} {
  if (expectedLiftPct === null || !Number.isFinite(expectedLiftPct)) {
    return {
      level: "low",
      headline: "Value signal not available yet",
      detail: "The agent needs a stronger experiment candidate before estimated upside can be expressed.",
    };
  }

  if (expectedLiftPct >= 0.08) {
    return {
      level: "high",
      headline: "High upside unlocked",
      detail: `The current best experiment suggests a strong potential lift of ${fmtPct(expectedLiftPct)}.`,
    };
  }

  if (expectedLiftPct >= 0.03) {
    return {
      level: "moderate",
      headline: "Moderate upside unlocked",
      detail: `The current best experiment suggests a meaningful potential lift of ${fmtPct(expectedLiftPct)}.`,
    };
  }

  return {
    level: "low",
    headline: "Early upside signal",
    detail: `The current best experiment suggests an initial potential lift of ${fmtPct(expectedLiftPct)}.`,
  };
}

function deriveWhyNotNow(params: {
  decision: "auto_run" | "safe_override" | "no_action";
  blockedBy: string[];
  topPredictionKey: string | null;
}): {
  severity: "none" | "medium" | "high";
  headline: string;
  detail: string;
} {
  const { decision, blockedBy, topPredictionKey } = params;
  const experimentLabel = topPredictionKey ?? "the current top experiment";

  if (decision === "auto_run") {
    return {
      severity: "none",
      headline: "No execution blocker",
      detail: `${experimentLabel} is currently eligible for standard autonomous execution.`,
    };
  }

  if (decision === "safe_override") {
    return {
      severity: "none",
      headline: "Only approval is missing",
      detail: `${experimentLabel} is ready for a controlled manual confirmation run.`,
    };
  }

  if (blockedBy.includes("cooldown_active")) {
    return {
      severity: "medium",
      headline: "Execution is intentionally delayed",
      detail: `${experimentLabel} is in cooldown, so repeat execution is temporarily blocked to avoid rapid reruns.`,
    };
  }

  if (blockedBy.includes("already_running")) {
    return {
      severity: "medium",
      headline: "Execution is already in progress",
      detail: `${experimentLabel} has an active run and should finish before the next trigger is allowed.`,
    };
  }

  if (
    blockedBy.includes("safe_override_requires_min_3_runs") ||
    blockedBy.includes("bootstrap_safe_override_requires_min_1_run") ||
    blockedBy.includes("missing_experiment_history")
  ) {
    return {
      severity: "high",
      headline: "There is not enough learning evidence yet",
      detail: `${experimentLabel} needs more completed experiment history before Aurik can justify execution with confidence.`,
    };
  }

  if (
    blockedBy.includes("bootstrap_safe_override_requires_neutral_rate_eq_1") ||
    blockedBy.includes("safe_override_requires_neutral_rate_gte_0_6") ||
    blockedBy.includes("safe_override_requires_zero_failures")
  ) {
    return {
      severity: "high",
      headline: "Outcomes are not stable enough yet",
      detail: `${experimentLabel} still needs cleaner and more repeatable outcomes before execution risk is considered acceptable.`,
    };
  }

  if (blockedBy.includes("safe_override_requires_low_confidence")) {
    return {
      severity: "high",
      headline: "The signal is still too weak",
      detail: `${experimentLabel} has not yet reached the quality of evidence needed to justify execution.`,
    };
  }

  if (blockedBy.includes("missing_impact")) {
    return {
      severity: "high",
      headline: "No live impact is connected",
      detail: "The agent needs a measurable impact target before it can link decisions to real business outcomes.",
    };
  }

  return {
    severity: "medium",
    headline: "The agent is still building decision confidence",
    detail: `${experimentLabel} remains the best candidate, but Aurik is waiting for stronger evidence before acting.`,
  };
}

function deriveAutonomyUnlocks(params: {
  decision: "auto_run" | "safe_override" | "no_action";
  blockedBy: string[];
}): {
  state: "ready" | "progressing" | "blocked";
  items: string[];
} {
  const { decision, blockedBy } = params;

  if (decision === "auto_run") {
    return {
      state: "ready",
      items: [
        "Maintain strong confidence on the top experiment.",
        "Keep successful outcomes stable over repeated runs.",
        "Continue execution without introducing new blockers.",
      ],
    };
  }

  if (decision === "safe_override") {
    return {
      state: "progressing",
      items: [
        "Complete a controlled confirmation run.",
        "Preserve zero-failure behavior on the experiment.",
        "Convert controlled evidence into full auto-run readiness.",
      ],
    };
  }

  const items: string[] = [];

  if (
    blockedBy.includes("safe_override_requires_min_3_runs") ||
    blockedBy.includes("bootstrap_safe_override_requires_min_1_run") ||
    blockedBy.includes("missing_experiment_history")
  ) {
    items.push("Accumulate more completed experiment runs.");
  }

  if (
    blockedBy.includes("bootstrap_safe_override_requires_neutral_rate_eq_1") ||
    blockedBy.includes("safe_override_requires_neutral_rate_gte_0_6")
  ) {
    items.push("Improve neutral stability across outcomes.");
  }

  if (blockedBy.includes("safe_override_requires_zero_failures")) {
    items.push("Eliminate failure outcomes on the top candidate.");
  }

  if (blockedBy.includes("safe_override_requires_low_confidence")) {
    items.push("Strengthen evidence quality until confidence improves.");
  }

  if (blockedBy.includes("cooldown_active")) {
    items.push("Wait until cooldown expires before the next execution.");
  }

  if (blockedBy.includes("already_running")) {
    items.push("Let the current experiment finish before re-triggering.");
  }

  if (blockedBy.includes("missing_impact")) {
    items.push("Connect the agent to a measurable impact target.");
  }

  if (items.length === 0) {
    items.push("Continue learning and collecting decision evidence.");
    items.push("Improve outcome consistency on the top experiment.");
    items.push("Increase confidence until execution thresholds are met.");
  }

  return {
    state: items.length <= 2 ? "progressing" : "blocked",
    items: items.slice(0, 3),
  };
}

function extractLiveScore(json: AgentScoreV1Response, fallback: number): number {
  if (!json.ok) return fallback;

  if (typeof json.score?.value === "number" && Number.isFinite(json.score.value)) {
    return json.score.value;
  }

  if (typeof json.computedScore === "number" && Number.isFinite(json.computedScore)) {
    return json.computedScore;
  }

  if (typeof json.scoreValue === "number" && Number.isFinite(json.scoreValue)) {
    return json.scoreValue;
  }

  return fallback;
}

export default function AgentIntelligenceDashboard({
  agentId,
  agentSlug,
  initialScore,
  initialExperience,
}: Props) {
  const { loading, error, autonomyResp, topPrediction } = useAgentInsights();

  const [liveScore, setLiveScore] = useState<number>(initialScore);
  const [scoreLoading, setScoreLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refreshScore() {
      try {
        setScoreLoading(true);

        const res = await fetch(
          `/api/internal/agent-score-v1?agentId=${encodeURIComponent(agentId)}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        if (!res.ok) {
          return;
        }

        const json = (await res.json()) as AgentScoreV1Response;
        const nextScore = extractLiveScore(json, initialScore);

        if (!cancelled) {
          setLiveScore(nextScore);
        }
      } catch {
        // keep last known score
      } finally {
        if (!cancelled) {
          setScoreLoading(false);
        }
      }
    }

    void refreshScore();

    const onFocus = () => {
      void refreshScore();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshScore();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    const interval = window.setInterval(() => {
      void refreshScore();
    }, 10000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [agentId, initialScore]);

  const dashboard = useMemo(() => {
    const decision: "auto_run" | "safe_override" | "no_action" =
      autonomyResp?.ok ? autonomyResp.decision : "no_action";

    const blockedBy =
      autonomyResp?.ok && autonomyResp.result.ok
        ? autonomyResp.result.debug?.blockedBy ?? []
        : [];

    const globalStatus = deriveGlobalStatus({
      decision,
      blockedBy,
      topPredictionExists: topPrediction !== null,
    });

    const intelligenceLevel = deriveIntelligenceLevel({
      score: liveScore,
      experience: initialExperience,
      decision,
    });

    const recommendedNextStep = deriveRecommendedNextStep({
      decision,
      blockedBy,
      topPredictionKey: topPrediction?.experimentKey ?? null,
    });

    const valueAtAGlance = deriveValueAtAGlance({
      score: liveScore,
      experience: initialExperience,
      intelligenceLevel,
      decision,
    });

    const potentialValueUnlocked = derivePotentialValueUnlocked(
      topPrediction?.expectedLiftPct ?? null
    );

    const whyNotNow = deriveWhyNotNow({
      decision,
      blockedBy,
      topPredictionKey: topPrediction?.experimentKey ?? null,
    });

    const autonomyUnlocks = deriveAutonomyUnlocks({
      decision,
      blockedBy,
    });

    return {
      globalStatus,
      decision,
      intelligenceLevel,
      intelligenceSummary: intelligenceSummary(intelligenceLevel),
      recommendedNextStep,
      valueAtAGlance,
      potentialValueUnlocked,
      whyNotNow,
      autonomyUnlocks,
      reason:
        autonomyResp?.ok
          ? autonomyResp.reason
          : error ?? "Dashboard data unavailable",
      topPrediction,
      topBlocker:
        blockedBy.length > 0 ? blockedByLabel(blockedBy[0]) : "No blockers",
    };
  }, [autonomyResp, topPrediction, error, liveScore, initialExperience]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Agent Intelligence Dashboard
          </div>
          <div className="text-3xl font-bold">{agentSlug}</div>
          <div className="text-sm text-slate-500">Agent ID: {agentId}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div
            className={`inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium ${intelligenceBadgeClass(
              dashboard.intelligenceLevel
            )}`}
          >
            Intelligence: {dashboard.intelligenceLevel}
          </div>

          <div
            className={`inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium ${statusBadgeClass(
              dashboard.globalStatus
            )}`}
          >
            Status: {prettyGlobalStatus(dashboard.globalStatus)}
          </div>

          <div
            className={`inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium ${autonomyBadgeClass(
              dashboard.decision
            )}`}
          >
            Autonomy: {prettyDecision(dashboard.decision)}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Intelligence level
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {dashboard.intelligenceLevel}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Current operating maturity
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Score
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {liveScore.toFixed(3
          )}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {scoreLoading ? "Refreshing live score…" : "Current composite agent score"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Experience
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {initialExperience.toFixed(0)}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Current accumulated learning state
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Best candidate
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {dashboard.topPrediction?.experimentKey ?? "—"}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {dashboard.topPrediction
              ? `Expected lift ${fmtPct(dashboard.topPrediction.expectedLiftPct)}`
              : "No experiment candidate yet"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Primary blocker
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {dashboard.topBlocker}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Main reason the next action is gated
          </div>
        </div>
      </div>

      <div
        className={`mt-5 rounded-xl border p-4 ${nextStepClass(
          dashboard.recommendedNextStep.priority
        )}`}
      >
        <div className="text-xs uppercase tracking-wide opacity-70">
          Recommended next step
        </div>
        <div className="mt-2 text-lg font-semibold">
          {dashboard.recommendedNextStep.title}
        </div>
        <div className="mt-1 text-sm opacity-80">
          {dashboard.recommendedNextStep.detail}
        </div>
      </div>

      <div
        className={`mt-5 rounded-xl border p-4 ${valuePotentialClass(
          dashboard.potentialValueUnlocked.level
        )}`}
      >
        <div className="text-xs uppercase tracking-wide opacity-70">
          Potential value unlocked
        </div>
        <div className="mt-2 text-lg font-semibold">
          {dashboard.potentialValueUnlocked.headline}
        </div>
        <div className="mt-1 text-sm opacity-80">
          {dashboard.potentialValueUnlocked.detail}
        </div>
      </div>

      <div
        className={`mt-5 rounded-xl border p-4 ${whyNotNowClass(
          dashboard.whyNotNow.severity
        )}`}
      >
        <div className="text-xs uppercase tracking-wide opacity-70">
          Why not now?
        </div>
        <div className="mt-2 text-lg font-semibold">
          {dashboard.whyNotNow.headline}
        </div>
        <div className="mt-1 text-sm opacity-80">
          {dashboard.whyNotNow.detail}
        </div>
      </div>

      <div
        className={`mt-5 rounded-xl border p-4 ${unlockClass(
          dashboard.autonomyUnlocks.state
        )}`}
      >
        <div className="text-xs uppercase tracking-wide opacity-70">
          What unlocks autonomy?
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {dashboard.autonomyUnlocks.items.map((item, index) => (
            <div
              key={`${agentSlug}-unlock-${index}`}
              className="rounded-lg bg-white/70 p-3 text-sm"
            >
              <div className="opacity-60">Condition {index + 1}</div>
              <div className="mt-1 font-medium">{item}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-black/10 bg-black/5 p-4">
        <div className="text-xs uppercase tracking-wide opacity-60">
          Value at a glance
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 text-sm lg:grid-cols-3">
          <div className="rounded-lg bg-white/70 p-3">
            <div className="opacity-60">Performance</div>
            <div className="mt-1 font-medium">
              {dashboard.valueAtAGlance.performance}
            </div>
          </div>

          <div className="rounded-lg bg-white/70 p-3">
            <div className="opacity-60">Readiness</div>
            <div className="mt-1 font-medium">
              {dashboard.valueAtAGlance.readiness}
            </div>
          </div>

          <div className="rounded-lg bg-white/70 p-3">
            <div className="opacity-60">Next unlock</div>
            <div className="mt-1 font-medium">
              {dashboard.valueAtAGlance.unlock}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          Executive summary
        </div>
        <div className="mt-2 text-sm text-slate-700">
          {loading ? "Refreshing intelligence summary…" : dashboard.reason}
        </div>
        <div className="mt-2 text-sm text-slate-500">
          {dashboard.intelligenceSummary}
        </div>
        {error ? (
          <div className="mt-2 text-sm text-red-600">{error}</div>
        ) : null}
      </div>
    </div>
  );
}