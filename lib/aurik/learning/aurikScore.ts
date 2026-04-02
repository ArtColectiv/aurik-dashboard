// lib/aurik/learning/aurikScore.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

export type AurikScoreV1Inputs = {
  agentName: string;

  // Latest official snapshot inputs (all expected in [0..1], but we clamp anyway)
  dataVolume: number;
  feedbackAlignment: number;
  platformPerformance: number;
  consistency: number;

  // Persisted state (from DB in later steps)
  previousScore?: number | null;
  previousExperienceCapital?: number | null;

  // Tunables
  cap?: number; // default 100000
  k?: number; // default 0.015
  bonusRate?: number; // default 1.0
  baseGrowth?: number; // default 1.0 (1 unit experience per month)
};

export type AurikScoreV1Result = {
  agentName: string;
  score: number;
  experienceCapital: number;
  debug: {
    inputs: {
      dataVolume: number;
      feedbackAlignment: number;
      platformPerformance: number;
      consistency: number;
      previousScore: number;
      previousExperienceCapital: number;
      cap: number;
      k: number;
      bonusRate: number;
      baseGrowth: number;
    };
    qualityFactor: number;
    growth: {
      baseGrowth: number;
      bonusGrowth: number;
      totalGrowth: number;
    };
    computed: {
      theoreticalScore: number;
      monotoneScore: number;
    };
  };
};

// --- helpers (pure) ---
function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function clampMin0(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x;
}

function roundInt(x: number): number {
  // Score is an institutional-looking public number => integer
  if (!Number.isFinite(x)) return 0;
  return Math.round(x);
}

/**
 * Aurik Score V1 (monthly cycle intended):
 * - Compute QualityFactor from insights
 * - Guaranteed monthly growth in experience capital
 * - Convert experience -> score with saturating exponential (log-like early, capped long term)
 * - Monotone rule prevents score decreases
 *
 * Pure function: DOES NOT read/write DB, DOES NOT know about cycle timestamps.
 */
export function computeAurikScoreV1(input: AurikScoreV1Inputs): AurikScoreV1Result {
  const cap = isFiniteNumber(input.cap) ? input.cap : 100_000;
  const k = isFiniteNumber(input.k) ? input.k : 0.015;
  const bonusRate = isFiniteNumber(input.bonusRate) ? input.bonusRate : 1.0;
  const baseGrowth = isFiniteNumber(input.baseGrowth) ? input.baseGrowth : 1.0;

  const previousScore = clampMin0(isFiniteNumber(input.previousScore) ? input.previousScore : 0);
  const previousExperienceCapital = clampMin0(
    isFiniteNumber(input.previousExperienceCapital) ? input.previousExperienceCapital : 0
  );

  const dataVolume = clamp01(isFiniteNumber(input.dataVolume) ? input.dataVolume : 0);
  const feedbackAlignment = clamp01(isFiniteNumber(input.feedbackAlignment) ? input.feedbackAlignment : 0);
  const platformPerformance = clamp01(isFiniteNumber(input.platformPerformance) ? input.platformPerformance : 0);
  const consistency = clamp01(isFiniteNumber(input.consistency) ? input.consistency : 0);

  // 1) Quality Factor (0..1)
  const qualityRaw =
    0.4 * consistency +
    0.3 * feedbackAlignment +
    0.2 * platformPerformance +
    0.1 * dataVolume;

  const qualityFactor = clamp01(qualityRaw);

  // 2) Guaranteed monthly progression
  const safeBaseGrowth = clampMin0(baseGrowth);
  const safeBonusRate = clampMin0(bonusRate);

  const bonusGrowth = safeBaseGrowth * qualityFactor * safeBonusRate;
  const totalGrowth = safeBaseGrowth + bonusGrowth;

  const experienceCapital = previousExperienceCapital + totalGrowth;

  // 3) Curve (saturating exponential)
  // score = cap * (1 - exp(-k * experienceCapital))
  const safeCap = clampMin0(cap);
  const safeK = clampMin0(k);

  const theoreticalScoreFloat = safeCap * (1 - Math.exp(-safeK * experienceCapital));
  const theoreticalScore = roundInt(theoreticalScoreFloat);

  // 4) Monotone rule
  const monotoneScore = Math.max(roundInt(previousScore), theoreticalScore);

  return {
    agentName: input.agentName,
    score: monotoneScore,
    experienceCapital,
    debug: {
      inputs: {
        dataVolume,
        feedbackAlignment,
        platformPerformance,
        consistency,
        previousScore,
        previousExperienceCapital,
        cap: safeCap,
        k: safeK,
        bonusRate: safeBonusRate,
        baseGrowth: safeBaseGrowth,
      },
      qualityFactor,
      growth: {
        baseGrowth: safeBaseGrowth,
        bonusGrowth,
        totalGrowth,
      },
      computed: {
        theoreticalScore,
        monotoneScore,
      },
    },
  };
}
