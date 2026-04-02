// lib/aurik/learning/aurikBadgeEngine.ts

export type AurikBadgeCode =
  | "NEW"
  | "CONSISTENT"
  | "RISING"
  | "HIGH_VELOCITY"
  | "STABLE"
  | "DORMANT"
  | "ELITE"
  | "DOMINANT";

export type ComputeAurikBadgesInput = {
  score: number;
  experienceCapital: number;

  // History-derived deltas (score)
  delta1mScore: number;
  delta2mScore: number;
  momentum3mScore: number;

  // Optional (kept for backward compatibility)
  delta1mExp?: number;
  momentum3mExp?: number;

  // NEW: optional, so existing callers don't break
  strategicPowerIndex?: number;
};

function num(x: unknown): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function abs(n: number): number {
  return Math.abs(n);
}

export function computeAurikBadges(input: ComputeAurikBadgesInput): AurikBadgeCode[] {
  const score = num(input.score);
  const exp = num(input.experienceCapital);

  const d1 = num(input.delta1mScore);
  const d2 = num(input.delta2mScore);
  const m3 = num(input.momentum3mScore);

  const spiX = input.strategicPowerIndex === undefined ? undefined : num(input.strategicPowerIndex);

  const badges: AurikBadgeCode[] = [];

  // INFO
  const isNew = exp <= 2;
  if (isNew) badges.push("NEW");

  // PERFORMANCE
  if (d1 >= 1) badges.push("CONSISTENT");
  if (m3 >= 250) badges.push("RISING");
  if (m3 >= 800) badges.push("HIGH_VELOCITY");

  // STABILITY / DORMANCY
  if (score >= 20_000 && abs(d1) <= 150 && abs(d2) <= 150) badges.push("STABLE");

  const isDormant = !isNew && score >= 1_000 && abs(d1) <= 10 && abs(d2) <= 10;
  if (isDormant) badges.push("DORMANT");

  // ELITE (blue-chip)
  if (score >= 60_000) badges.push("ELITE");

  // NEW: DOMINANT (rare, institutional)
  // Rule v1: strategicPowerIndex >= 0.95
  if (spiX !== undefined && spiX >= 0.95) badges.push("DOMINANT");

  return badges;
}
