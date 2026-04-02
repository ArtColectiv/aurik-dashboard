// lib/aurik/score/scoreEngine.ts
// Aurik Score Engine (isolated, versioned, backward-compatible by design)
// V1: score derived from tasks_count + avg_output_length with logarithmic growth + clamp 0–5
// Stabilized V1: richness signal is gated by task volume to prevent early score spikes.
//
// NOTE: This file is intentionally dependency-free and does NOT touch any existing code.

export type AurikScoreVersion = "v1";

export type AurikScoreV1Input = {
  /** Total number of tasks executed for the agent (historical cumulative). */
  tasksCount: number;
  /** Average output length (chars) across tasks (or your current unit). */
  avgOutputLength: number;
};

export type AurikScoreComponent = {
  key: string;
  label: string;

  /** Raw metric value (e.g., tasksCount). */
  metric: number;

  /** Weight applied to this component in the raw score. */
  weight: number;

  /** Log-scaled signal in [0..1] after normalization against a cap. */
  signal01: number;

  /** Contribution to the final score in score-points (0..maxScore). */
  contribution: number;

  /** Extra details useful for debugging / investor-facing transparency. */
  details?: Record<string, number>;
};

export type AurikScoreV1Result = {
  version: AurikScoreVersion;

  /** Final score, clamped to [0..maxScore]. */
  score: number;

  /** Confidence in [0..1]. */
  confidence: number;

  /** Transparent breakdown of what drove the score. */
  components: AurikScoreComponent[];

  /** Debug/trace metadata (safe, deterministic). */
  meta: {
    maxScore: number;
    rawScore01: number;
    rawScorePoints: number;
    clampedScore: number;
  };
};

export type AurikScoreV1Config = {
  /** Max score value (matches existing clamp 0–5). */
  maxScore: number;

  /**
   * Normalization caps: values at/above these produce near-max signal for that component.
   * Tune later without changing the engine interface (investor-friendly).
   */
  caps: {
    tasksCount: number;
    avgOutputLength: number;
  };

  /** Component weights (must be non-negative). */
  weights: {
    tasksCount: number;
    avgOutputLength: number;
  };

  /**
   * Stabilization: gate richness contribution by task volume.
   * Prevents "1 big output => huge score".
   */
  stabilization: {
    /**
     * Richness gating curve:
     * gate = 1 - exp(-tasksCount / richnessGateK)
     * - tasks=0 => gate=0
     * - tasks=K => ~0.632
     * - tasks=2K => ~0.865
     * - tasks=3K => ~0.95
     */
    richnessGateK: number;
  };

  /**
   * Confidence tuning:
   * - primarily increases with task volume (more evidence)
   * - small bonus when avgOutputLength isn't tiny (less noise)
   * - deterministic + simple
   */
  confidence: {
    /** Tasks count scale for confidence growth (exp curve). */
    tasksK: number;
    /** Output length at which we consider signal "healthy". */
    outputStrongAt: number;
    /** Hard floor so confidence is never 0 if inputs are valid. */
    floor: number;
  };
};

export type AurikScoreEngineV1 = {
  version: AurikScoreVersion;
  compute(input: AurikScoreV1Input): AurikScoreV1Result;
  config: Readonly<AurikScoreV1Config>;
};

const DEFAULT_CONFIG: AurikScoreV1Config = {
  maxScore: 5,
  caps: {
    tasksCount: 500,
    avgOutputLength: 2000,
  },
  weights: {
    tasksCount: 0.5,
    avgOutputLength: 0.5,
  },
  stabilization: {
    // Investor-friendly: richness ramps in as agent proves itself.
    // With K=15: 1 task => ~0.064; 5 => ~0.283; 15 => ~0.632; 30 => ~0.865
    richnessGateK: 15,
  },
  confidence: {
    // Confidence ramps mainly with volume:
    // With K=25: 1 => ~0.039; 10 => ~0.330; 25 => ~0.632; 50 => ~0.865
    tasksK: 25,
    outputStrongAt: 500,
    floor: 0.1,
  },
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * Log-scaled, normalized signal in [0..1] using a cap.
 * signal01 = log1p(metric) / log1p(cap)
 */
function logSignal01(metric: number, cap: number): number {
  const safeMetric = Math.max(0, metric);
  const safeCap = Math.max(1, cap);
  const denom = Math.log1p(safeCap);
  if (denom <= 0) return 0;
  return clamp(Math.log1p(safeMetric) / denom, 0, 1);
}

/**
 * gate = 1 - exp(-x / k), clamped in [0..1]
 */
function expGate01(x: number, k: number): number {
  const safeX = Math.max(0, x);
  const safeK = Math.max(1e-6, k);
  const gate = 1 - Math.exp(-safeX / safeK);
  return clamp(gate, 0, 1);
}

/**
 * Confidence in [0..1]:
 * - mostly driven by tasksCount via exp curve (evidence)
 * - tiny bonus from output being healthy
 */
function computeConfidence(input: AurikScoreV1Input, cfg: AurikScoreV1Config): number {
  const tasksEvidence = expGate01(input.tasksCount, cfg.confidence.tasksK);

  const outputEvidence = clamp(
    input.avgOutputLength / Math.max(1, cfg.confidence.outputStrongAt),
    0,
    1,
  );

  // Strongly favor volume; keep output as a small stabilizer
  const combined = 0.85 * tasksEvidence + 0.15 * outputEvidence;

  return clamp(Math.max(cfg.confidence.floor, combined), 0, 0.99);
}

function validateInput(input: AurikScoreV1Input): void {
  if (!input || typeof input !== "object") {
    throw new Error("AurikScoreV1Input is required.");
  }
  if (!isFiniteNumber(input.tasksCount) || input.tasksCount < 0) {
    throw new Error("tasksCount must be a finite non-negative number.");
  }
  if (!isFiniteNumber(input.avgOutputLength) || input.avgOutputLength < 0) {
    throw new Error("avgOutputLength must be a finite non-negative number.");
  }
}

function validateConfig(cfg: AurikScoreV1Config): void {
  if (!isFiniteNumber(cfg.maxScore) || cfg.maxScore <= 0) {
    throw new Error("config.maxScore must be a finite positive number.");
  }
  if (
    !isFiniteNumber(cfg.caps.tasksCount) ||
    cfg.caps.tasksCount <= 0 ||
    !isFiniteNumber(cfg.caps.avgOutputLength) ||
    cfg.caps.avgOutputLength <= 0
  ) {
    throw new Error("config.caps must be finite positive numbers.");
  }
  if (
    !isFiniteNumber(cfg.weights.tasksCount) ||
    cfg.weights.tasksCount < 0 ||
    !isFiniteNumber(cfg.weights.avgOutputLength) ||
    cfg.weights.avgOutputLength < 0
  ) {
    throw new Error("config.weights must be finite non-negative numbers.");
  }
  if (
    !isFiniteNumber(cfg.stabilization.richnessGateK) ||
    cfg.stabilization.richnessGateK <= 0
  ) {
    throw new Error("config.stabilization.richnessGateK must be a finite positive number.");
  }
  if (
    !isFiniteNumber(cfg.confidence.tasksK) ||
    cfg.confidence.tasksK <= 0 ||
    !isFiniteNumber(cfg.confidence.outputStrongAt) ||
    cfg.confidence.outputStrongAt <= 0 ||
    !isFiniteNumber(cfg.confidence.floor) ||
    cfg.confidence.floor < 0 ||
    cfg.confidence.floor > 1
  ) {
    throw new Error("config.confidence values must be valid.");
  }
}

export function createAurikScoreEngineV1(
  overrides?: Partial<AurikScoreV1Config>,
): AurikScoreEngineV1 {
  const merged: AurikScoreV1Config = {
    ...DEFAULT_CONFIG,
    ...overrides,
    caps: {
      ...DEFAULT_CONFIG.caps,
      ...(overrides?.caps ?? {}),
    },
    weights: {
      ...DEFAULT_CONFIG.weights,
      ...(overrides?.weights ?? {}),
    },
    stabilization: {
      ...DEFAULT_CONFIG.stabilization,
      ...(overrides?.stabilization ?? {}),
    },
    confidence: {
      ...DEFAULT_CONFIG.confidence,
      ...(overrides?.confidence ?? {}),
    },
  };

  validateConfig(merged);

  const engine: AurikScoreEngineV1 = {
    version: "v1",
    config: Object.freeze(merged),

    compute(input: AurikScoreV1Input): AurikScoreV1Result {
      validateInput(input);

      const maxScore = merged.maxScore;

      const tasksSignal01 = logSignal01(input.tasksCount, merged.caps.tasksCount);
      const outputSignal01Raw = logSignal01(input.avgOutputLength, merged.caps.avgOutputLength);

      // Stabilization: richness gated by task volume (prevents early spikes)
      const richnessGate01 = expGate01(input.tasksCount, merged.stabilization.richnessGateK);
      const outputSignal01 = clamp(outputSignal01Raw * richnessGate01, 0, 1);

      const wTasks = merged.weights.tasksCount;
      const wOutput = merged.weights.avgOutputLength;
      const weightSum = Math.max(1e-9, wTasks + wOutput);

      const rawScore01 = (wTasks * tasksSignal01 + wOutput * outputSignal01) / weightSum;

      const rawScorePoints = rawScore01 * maxScore;
      const clampedScore = clamp(rawScorePoints, 0, maxScore);

      const tasksContribution = (wTasks / weightSum) * tasksSignal01 * maxScore;
      const outputContribution = (wOutput / weightSum) * outputSignal01 * maxScore;

      const components: AurikScoreComponent[] = [
        {
          key: "tasks_count",
          label: "Task volume",
          metric: input.tasksCount,
          weight: wTasks,
          signal01: tasksSignal01,
          contribution: tasksContribution,
          details: {
            cap: merged.caps.tasksCount,
            log1p_metric: Math.log1p(Math.max(0, input.tasksCount)),
            log1p_cap: Math.log1p(Math.max(1, merged.caps.tasksCount)),
          },
        },
        {
          key: "avg_output_length",
          label: "Output richness",
          metric: input.avgOutputLength,
          weight: wOutput,
          // IMPORTANT: we expose the stabilized signal (truth for investors)
          signal01: outputSignal01,
          contribution: outputContribution,
          details: {
            cap: merged.caps.avgOutputLength,
            log1p_metric: Math.log1p(Math.max(0, input.avgOutputLength)),
            log1p_cap: Math.log1p(Math.max(1, merged.caps.avgOutputLength)),
            richness_gate_k: merged.stabilization.richnessGateK,
            richness_gate01: richnessGate01,
            output_signal01_raw: outputSignal01Raw,
          },
        },
      ];

      const confidence = computeConfidence(input, merged);

      return {
        version: "v1",
        score: clampedScore,
        confidence,
        components,
        meta: {
          maxScore,
          rawScore01,
          rawScorePoints,
          clampedScore,
        },
      };
    },
  };

  return engine;
}

export const AurikScoreEngineV1: AurikScoreEngineV1 = createAurikScoreEngineV1();