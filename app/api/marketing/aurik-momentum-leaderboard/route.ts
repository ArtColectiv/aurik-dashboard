// app/api/marketing/aurik-momentum-leaderboard/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeAurikBadges } from "@/lib/aurik/learning/aurikBadgeEngine";
import { AURIK_SCORE_VERSION } from "@/lib/aurik/learning/aurikScoreVersion";

export const runtime = "nodejs";

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function num(x: unknown): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function getCycleStartUTC(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addMonthsUTC(date: Date, deltaMonths: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + deltaMonths, 1, 0, 0, 0, 0));
}

function toIsoUtc(d: Date) {
  return d.toISOString();
}

type AgentRow = {
  id: string;
  aurik_score: number;
  aurik_experience_capital: number;
  aurik_score_last_cycle_at: string | null;
};

type HistoryRow = {
  agent_id: string;
  cycle_start_at: string;
  score: number;
  experience_capital: number;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = clampInt(Number(searchParams.get("limit") ?? 50), 1, 200);
    const poolSize = clampInt(Number(searchParams.get("pool") ?? 200), limit, 1000);

    const supabase = getSupabaseAdminClient();

    const { data: agentsData, error: agentsErr } = await supabase
      .from("aurik_agents")
      .select("id, aurik_score, aurik_experience_capital, aurik_score_last_cycle_at")
      .order("aurik_score", { ascending: false })
      .limit(poolSize);

    if (agentsErr) {
      return NextResponse.json(
        { ok: false, error: "DB error loading agents", details: agentsErr.message },
        { status: 500 }
      );
    }

    const agents = (agentsData ?? []) as unknown as AgentRow[];
    const agentIds = agents.map((a) => a.id);

    const m0 = getCycleStartUTC(new Date());
    const m1 = addMonthsUTC(m0, -1);
    const m2 = addMonthsUTC(m0, -2);

    const m0Iso = toIsoUtc(m0);
    const m1Iso = toIsoUtc(m1);
    const m2Iso = toIsoUtc(m2);

    const histByAgent = new Map<string, { m0?: HistoryRow; m1?: HistoryRow; m2?: HistoryRow }>();

    if (agentIds.length > 0) {
      const { data: histData } = await supabase
        .from("aurik_score_history")
        .select("agent_id, cycle_start_at, score, experience_capital")
        .in("agent_id", agentIds)
        .in("cycle_start_at", [m2Iso, m1Iso, m0Iso]);

      const rows = (histData ?? []) as unknown as HistoryRow[];
      for (const r of rows) {
        const bucket = histByAgent.get(r.agent_id) ?? {};
        if (r.cycle_start_at === m0Iso) bucket.m0 = r;
        if (r.cycle_start_at === m1Iso) bucket.m1 = r;
        if (r.cycle_start_at === m2Iso) bucket.m2 = r;
        histByAgent.set(r.agent_id, bucket);
      }
    }

    const computed = agents.map((a) => {
      const h = histByAgent.get(a.id);

      const s0 = num(h?.m0?.score);
      const s1 = num(h?.m1?.score);
      const s2 = num(h?.m2?.score);

      const e0 = num(h?.m0?.experience_capital);
      const e1 = num(h?.m1?.experience_capital);
      const e2 = num(h?.m2?.experience_capital);

      const delta1mScore = s0 - s1;
      const delta2mScore = s1 - s2;
      const momentum3mScore = delta1mScore + delta2mScore;

      const delta1mExp = e0 - e1;
      const delta2mExp = e1 - e2;
      const momentum3mExp = delta1mExp + delta2mExp;

      const scoreNow = num(a.aurik_score);
      const expNow = num(a.aurik_experience_capital);

      const badges = computeAurikBadges({
        score: scoreNow,
        experienceCapital: expNow,
        delta1mScore,
        delta2mScore,
        momentum3mScore,
        delta1mExp,
        momentum3mExp,
      });

      return {
        agentId: a.id,
        score: scoreNow,
        experienceCapital: expNow,
        lastCycleAt: a.aurik_score_last_cycle_at,
        momentum: {
          score_3m: momentum3mScore,
          exp_3m: momentum3mExp,
        },
        badges,
      };
    });

    computed.sort((a, b) => {
      const dm = b.momentum.score_3m - a.momentum.score_3m;
      if (dm !== 0) return dm;
      return b.score - a.score;
    });

    const items = computed.slice(0, limit).map((it, idx) => ({
      rank: idx + 1,
      ...it,
    }));

    return NextResponse.json({
      ok: true,
      version: AURIK_SCORE_VERSION,
      cycle: { m0: m0Iso, m1: m1Iso, m2: m2Iso },
      items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
