// app/api/internal/recalculate-aurik-scores/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeAurikScoreV1 } from "@/lib/aurik/learning/aurikScore";
import { AURIK_SCORE_VERSION } from "@/lib/aurik/learning/aurikScoreVersion";
import { computeAgentMarketingInsights } from "@/lib/aurik/learning/marketingLearningEngine";

export const runtime = "nodejs";

type AurikAgentRow = {
  id: string;
  niche: string | null;
  aurik_score: number | null;
  aurik_experience_capital: number | null;
  aurik_score_last_cycle_at: string | null;
  strategic_power_index: number | null;
  aurik_score_version: string | null;
  aurik_score_confidence: number | null;
};

type DbRow = Record<string, unknown>;

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function requireInternalAuth(req: Request) {
  const expected = process.env.AURIK_INTERNAL_CRON_SECRET;
  if (!expected) throw new Error("Missing env: AURIK_INTERNAL_CRON_SECRET");

  const got =
    req.headers.get("x-aurik-internal-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  return !!got && got === expected;
}

function num(x: unknown): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function computeConfidence(args: { feedbackCount: number; publishedCount: number; metricsCount: number }) {
  const fb = Math.max(0, args.feedbackCount);
  const pub = Math.max(0, args.publishedCount);
  const met = Math.max(0, args.metricsCount);

  const fbScore = clamp01(fb / 10);
  const pubScore = clamp01(pub / 5);
  const metScore = clamp01(met / 20);

  const raw = 0.5 * metScore + 0.3 * pubScore + 0.2 * fbScore;
  const hasAny = fb + pub + met > 0;

  return hasAny ? clamp01(raw) : 0.05;
}

function toIsoUtc(d: Date) {
  return d.toISOString();
}

function getCycleStartUTC(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addMonthsUTC(date: Date, deltaMonths: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + deltaMonths, 1, 0, 0, 0, 0));
}

function isSameOrAfter(aIso: string, bIso: string): boolean {
  return new Date(aIso).getTime() >= new Date(bIso).getTime();
}

function percentileFromRank(rank: number, total: number): number {
  if (!Number.isFinite(rank) || !Number.isFinite(total) || total <= 0) return 0;
  const p = 1 - (rank - 1) / total;
  return Math.max(0, Math.min(1, p));
}

type ValuationTier = "A" | "B" | "C" | "D";

function computeValuation(spx: number): { valuationTier: ValuationTier; valuationLabel: string } {
  if (spx >= 1.2) return { valuationTier: "A", valuationLabel: "Market Leader" };
  if (spx >= 1.0) return { valuationTier: "B", valuationLabel: "Strong Position" };
  if (spx >= 0.8) return { valuationTier: "C", valuationLabel: "Emerging Power" };
  return { valuationTier: "D", valuationLabel: "Developing" };
}

export async function POST(req: Request) {
  try {
    if (!requireInternalAuth(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdminClient();

    const cycleStart = getCycleStartUTC(new Date());
    const cycleStartIso = toIsoUtc(cycleStart);

    // Load agents (official state)
    const { data: agentsRaw, error: agentsErr } = await supabase
      .from("aurik_agents")
      .select(
        "id, niche, aurik_score, aurik_experience_capital, aurik_score_last_cycle_at, strategic_power_index, aurik_score_version, aurik_score_confidence"
      );

    if (agentsErr) {
      return NextResponse.json(
        { ok: false, error: "DB error loading agents", details: agentsErr.message },
        { status: 500 }
      );
    }

    const agents = (agentsRaw ?? []) as unknown as AurikAgentRow[];

    const processed: Array<{ agentId: string; score: number; experienceCapital: number; confidence: number }> = [];
    const skipped: Array<{ agentId: string; reason: string }> = [];
    const failed: Array<{ agentId: string; error: string }> = [];

    // Keep confidence computed per agent for this cycle (even if skipped)
    const confidenceByAgent: Record<string, number> = {};
    const scoreByAgent: Record<string, number> = {};
    const expByAgent: Record<string, number> = {};

    // Phase 1: compute confidence + (if not already processed) compute score & persist
    for (const agent of agents) {
      const agentId = agent.id;
      const lastCycleAt = agent.aurik_score_last_cycle_at;

      const alreadyProcessed = !!lastCycleAt && isSameOrAfter(lastCycleAt, cycleStartIso);

      // IMPORTANT:
      // - If alreadyProcessed, we still compute confidence over the *previous month window* (official cycle window)
      // - and we backfill aurik_score_history + aurik_score_confidence, WITHOUT touching aurik_score / exp / last_cycle_at.
      const windowStart = alreadyProcessed ? addMonthsUTC(cycleStart, -1) : lastCycleAt ? new Date(lastCycleAt) : addMonthsUTC(cycleStart, -1);
      const windowStartIso = toIsoUtc(windowStart);

      try {
        // 1) Feedback rows (agent_name)
        const { data: feedbackRows, error: fbErr } = await supabase
          .from("marketing_generation_feedback")
          .select("*")
          .eq("agent_name", `agent_${agentId}`)
          .gte("created_at", windowStartIso)
          .lt("created_at", cycleStartIso);

        if (fbErr) throw new Error(`feedback query failed: ${fbErr.message}`);

        // 2) Published content ids (agent_name)
        const { data: publishedRows, error: pcErr } = await supabase
          .from("marketing_published_content")
          .select("id")
          .eq("agent_name", `agent_${agentId}`)
          .gte("created_at", windowStartIso)
          .lt("created_at", cycleStartIso);

        if (pcErr) throw new Error(`published content query failed: ${pcErr.message}`);

        const publishedIds = (publishedRows ?? [])
          .map((r) => (r as { id?: string | null }).id)
          .filter((v): v is string => typeof v === "string" && v.length > 0);

        // 3) Metrics by published_content_id
        const metricsRows: DbRow[] = [];
        if (publishedIds.length > 0) {
          const { data: mData, error: mErr } = await supabase
            .from("marketing_platform_metrics")
            .select("*")
            .in("published_content_id", publishedIds)
            .gte("created_at", windowStartIso)
            .lt("created_at", cycleStartIso);

          if (mErr) throw new Error(`metrics query failed: ${mErr.message}`);
          metricsRows.push(...((mData ?? []) as DbRow[]));
        }

        // 4) Insights (signature stricte)
        const insights = computeAgentMarketingInsights({
          agentName: `agent_${agentId}`,
          feedbackRows: (feedbackRows ?? []) as any,
          publishedRows: (publishedRows ?? []) as any,
          metricsRows: (metricsRows ?? []) as any,
        });

        const dataVolume = num((insights as any)?.dataVolume);
        const feedbackAlignment = num((insights as any)?.feedbackAlignment);
        const platformPerformance = num((insights as any)?.platformPerformance);
        const consistency = num((insights as any)?.consistency);

        // 5) Confidence
        const confidence = computeConfidence({
          feedbackCount: (feedbackRows ?? []).length,
          publishedCount: (publishedRows ?? []).length,
          metricsCount: metricsRows.length,
        });

        confidenceByAgent[agentId] = confidence;

        // If already processed: do NOT change score/exp/last_cycle_at
        if (alreadyProcessed) {
          scoreByAgent[agentId] = num(agent.aurik_score);
          expByAgent[agentId] = num(agent.aurik_experience_capital);

          // Backfill confidence on agent
          const { error: confErr } = await supabase
            .from("aurik_agents")
            .update({ aurik_score_confidence: confidence })
            .eq("id", agentId);

          if (confErr) throw new Error(`confidence update failed: ${confErr.message}`);

          skipped.push({ agentId, reason: "already_processed_for_cycle_backfilled_confidence" });
          continue;
        }

        // Not processed yet -> compute score as usual
        const prevScore = num(agent.aurik_score);
        const prevExp = num(agent.aurik_experience_capital);

        const result = computeAurikScoreV1({
          agentName: `agent_${agentId}`,
          dataVolume,
          feedbackAlignment,
          platformPerformance,
          consistency,
          previousScore: prevScore,
          previousExperienceCapital: prevExp,
          cap: 100_000,
          k: 0.015,
          bonusRate: 1.0,
          baseGrowth: 1.0,
        });

        scoreByAgent[agentId] = result.score;
        expByAgent[agentId] = result.experienceCapital;

        const { error: updErr } = await supabase
          .from("aurik_agents")
          .update({
            aurik_score: result.score,
            aurik_experience_capital: result.experienceCapital,
            aurik_score_last_cycle_at: cycleStartIso,
            aurik_score_version: AURIK_SCORE_VERSION,
            aurik_score_confidence: confidence,
          })
          .eq("id", agentId);

        if (updErr) throw new Error(`update failed: ${updErr.message}`);

        processed.push({
          agentId,
          score: result.score,
          experienceCapital: result.experienceCapital,
          confidence,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        failed.push({ agentId, error: msg });
      }
    }

    // Phase 2: recompute ranks/momentum/SPX and upsert official snapshot + history
    const { data: agentsNowRaw, error: agentsNowErr } = await supabase
      .from("aurik_agents")
      .select("id, niche, aurik_score, aurik_experience_capital, aurik_score_last_cycle_at, strategic_power_index, aurik_score_version, aurik_score_confidence");

    if (agentsNowErr) {
      return NextResponse.json(
        { ok: false, error: "DB error reloading agents", details: agentsNowErr.message },
        { status: 500 }
      );
    }

    const agentsNow = (agentsNowRaw ?? []) as unknown as AurikAgentRow[];
    const totalAgents = agentsNow.length;

    // niche counts
    const nicheCounts: Record<string, number> = {};
    for (const a of agentsNow) {
      const n = (a.niche ?? "").trim();
      if (!n) continue;
      nicheCounts[n] = (nicheCounts[n] ?? 0) + 1;
    }

    // momentum from aurik_score_history (previous cycles)
    const m1Iso = toIsoUtc(addMonthsUTC(cycleStart, -1));
    const m2Iso = toIsoUtc(addMonthsUTC(cycleStart, -2));

    const { data: prevHistRaw } = await supabase
      .from("aurik_score_history")
      .select("agent_id, cycle_start_at, score")
      .in("cycle_start_at", [m1Iso, m2Iso]);

    const prevMap: Record<string, { m1?: number; m2?: number }> = {};
    for (const r of (prevHistRaw ?? []) as any[]) {
      const id = String(r.agent_id);
      const bucket = prevMap[id] ?? {};
      if (r.cycle_start_at === m1Iso) bucket.m1 = num(r.score);
      if (r.cycle_start_at === m2Iso) bucket.m2 = num(r.score);
      prevMap[id] = bucket;
    }

    // score ranks
    const scoreSorted = [...agentsNow].sort((a, b) => num(b.aurik_score) - num(a.aurik_score));
    const scoreRankById: Record<string, number> = {};
    for (let i = 0; i < scoreSorted.length; i++) scoreRankById[scoreSorted[i].id] = i + 1;

    // momentum ranks
    const momentumById: Record<string, number> = {};
    for (const a of agentsNow) {
      const m0 = num(a.aurik_score);
      const prev = prevMap[a.id] ?? {};
      const m1 = prev.m1 === undefined ? m0 : prev.m1;
      const m2 = prev.m2 === undefined ? m1 : prev.m2;
      const d1 = m0 - m1;
      const d2 = m1 - m2;
      momentumById[a.id] = d1 + d2;
    }

    const momentumSortedIds = [...agentsNow]
      .map((a) => a.id)
      .sort((idA, idB) => momentumById[idB] - momentumById[idA]);

    const momentumRankById: Record<string, number> = {};
    for (let i = 0; i < momentumSortedIds.length; i++) momentumRankById[momentumSortedIds[i]] = i + 1;

    // upsert snapshot + history + persist SPX
    for (const a of agentsNow) {
      const id = a.id;
      const niche = (a.niche ?? "").trim() || null;

      const score = num(a.aurik_score);
      const exp = num(a.aurik_experience_capital);

      const scoreRankGlobal = scoreRankById[id] ?? totalAgents;
      const scorePctGlobal = percentileFromRank(scoreRankGlobal, totalAgents);

      const momentum3m = num(momentumById[id]);
      const momentumRankGlobal = momentumRankById[id] ?? totalAgents;
      const momentumPctGlobal = percentileFromRank(momentumRankGlobal, totalAgents);

      const marketDominanceIndex = (scorePctGlobal * 0.6) + (momentumPctGlobal * 0.4);

      const totalAgentsInNiche = niche ? (nicheCounts[niche] ?? 0) : 0;
      const supplyPressureIndex = niche ? Math.log10(totalAgentsInNiche + 1) : 0;

      const strategicPowerIndex = marketDominanceIndex * (1 + supplyPressureIndex * 0.25);
      const { valuationTier, valuationLabel } = computeValuation(strategicPowerIndex);

      // Persist SPX
      const { error: spxUpdErr } = await supabase
        .from("aurik_agents")
        .update({ strategic_power_index: strategicPowerIndex })
        .eq("id", id);

      if (spxUpdErr) {
        failed.push({ agentId: id, error: `strategic_power_index update failed: ${spxUpdErr.message}` });
      }

      // Snapshot (institutionnel)
      const { error: snapErr } = await supabase
        .from("aurik_agent_cycle_snapshot")
        .upsert(
          {
            agent_id: id,
            cycle_start_at: cycleStartIso,

            score,
            experience_capital: exp,
            strategic_power_index: strategicPowerIndex,

            score_rank_global: scoreRankGlobal,
            score_percentile_global: scorePctGlobal,

            momentum_3m: momentum3m,
            momentum_rank_global: momentumRankGlobal,
            momentum_percentile_global: momentumPctGlobal,

            market_dominance_index: marketDominanceIndex,
            supply_pressure_index: supplyPressureIndex,

            niche,
            total_agents_in_niche: niche ? totalAgentsInNiche : null,

            valuation_tier: valuationTier,
            valuation_label: valuationLabel,

            score_version: a.aurik_score_version ?? AURIK_SCORE_VERSION,
          } as any,
          { onConflict: "agent_id,cycle_start_at" }
        );

      if (snapErr) {
        failed.push({ agentId: id, error: `snapshot upsert failed: ${snapErr.message}` });
      }

      // History (public endpoint reads this) — IMPORTANT: column names = score / experience_capital
      const confidence = confidenceByAgent[id] ?? num(a.aurik_score_confidence);

      const { error: histErr } = await supabase
        .from("aurik_score_history")
        .upsert(
          {
            agent_id: id,
            cycle_start_at: cycleStartIso,
            score,
            experience_capital: exp,
            confidence,
          } as any,
          { onConflict: "agent_id,cycle_start_at" }
        );

      if (histErr) {
        failed.push({ agentId: id, error: `history upsert failed: ${histErr.message}` });
      }
    }

    return NextResponse.json({
      ok: true,
      cycleStartAt: cycleStartIso,
      counts: {
        processed: processed.length,
        skipped: skipped.length,
        failed: failed.length,
      },
      processed,
      skipped,
      failed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}
