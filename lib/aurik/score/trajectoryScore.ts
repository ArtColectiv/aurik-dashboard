// lib/aurik/score/trajectoryScore.ts

import { supabaseServer } from "../supabaseServer";

interface TrajectoryScoreResult {
  baseline: number;
  current: number;
  growth: number;        // (current - baseline) / baseline
  momentum: number;      // normalized vs baseline
  stability: number;     // range normalized vs baseline
  compositeScore: number;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Maps growth (0..∞) into 0..5 using log scaling.
 * Calibration: growth=2 (+200%) -> 5
 */
function growthToStateScore(growth: number) {
  if (!isFinite(growth)) return 0;
  const g = Math.max(0, growth);
  const denom = Math.log(1 + 2); // +200% is "exceptional"
  const score = 5 * (Math.log(1 + g) / denom);
  return clamp(score, 0, 5);
}

export async function computeTrajectoryScore(
  impactId: string,
  sampleSize = 5
): Promise<TrajectoryScoreResult | null> {
  const supabase = supabaseServer();

  // 1) Baseline: try marketing first, then generic (no .single())
  const { data: mRows, error: mErr } = await supabase
    .from("agent_marketing_impact")
    .select("baseline_value")
    .eq("id", impactId)
    .limit(1);

  if (mErr) return null;

  let baseline: number | null =
    mRows && mRows.length > 0 ? Number(mRows[0].baseline_value) : null;

  if (!baseline) {
    const { data: gRows, error: gErr } = await supabase
      .from("agent_impact")
      .select("baseline_value")
      .eq("id", impactId)
      .limit(1);

    if (gErr) return null;

    baseline = gRows && gRows.length > 0 ? Number(gRows[0].baseline_value) : null;
  }

  if (!baseline || baseline === 0) return null;

  // 2) Measurements
  const { data, error } = await supabase
    .from("impact_measurements")
    .select("measured_value, measured_at")
    .eq("impact_id", impactId)
    .order("measured_at", { ascending: false })
    .limit(sampleSize);

  if (error || !data || data.length === 0) return null;

  const values = data.map((d) => Number(d.measured_value)).filter((v) => isFinite(v));
  if (values.length === 0) return null;

  const current = values[0];

  // Growth relative to baseline
  const growth = (current - baseline) / baseline;

  // Momentum: change across window, normalized vs baseline
  const first = values[values.length - 1];
  const momentum = values.length > 1 ? (current - first) / baseline : 0;

  // Stability: range across window, normalized vs baseline
  const max = Math.max(...values);
  const min = Math.min(...values);
  const stability = (max - min) / baseline;

  // Scores
  const stateScore = growthToStateScore(growth);

  // Momentum: small boost/penalty; clamp into [-1, +1]
  const momentumScore = clamp(momentum * 1.5, -1, 1);

  // Stability penalty: keep gentle; clamp into [0, 1.5]
  const stabilityPenalty = clamp(stability * 0.75, 0, 1.5);

  let composite = stateScore + momentumScore - stabilityPenalty;
  composite = clamp(composite, 0, 5);

  return {
    baseline,
    current,
    growth,
    momentum,
    stability,
    compositeScore: composite,
  };
}