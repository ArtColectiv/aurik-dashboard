// app/api/marketing/aurik-leaderboard/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function percentileFromRank(rank: number, total: number): number {
  if (!Number.isFinite(rank) || !Number.isFinite(total) || total <= 0) return 0;
  const p = 1 - (rank - 1) / total;
  return Math.max(0, Math.min(1, p));
}

type Mode = "score" | "strategic";

function parseMode(raw: string | null): Mode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "strategic") return "strategic";
  return "score";
}

type AgentRow = {
  id: string;
  niche: string | null;
  aurik_score: number | null;
  aurik_experience_capital: number | null;
  aurik_score_last_cycle_at: string | null;
  strategic_power_index: number | null;
};

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { searchParams } = new URL(req.url);

    const limit = clampInt(Number(searchParams.get("limit") ?? 50), 1, 200);
    const offset = clampInt(Number(searchParams.get("offset") ?? 0), 0, 100_000);
    const niche = (searchParams.get("niche") ?? "").trim();
    const mode = parseMode(searchParams.get("mode"));

    const orderCol = mode === "strategic" ? "strategic_power_index" : "aurik_score";

    // totals
    const { count: totalAgentsCount, error: totalAgentsErr } = await supabase
      .from("aurik_agents")
      .select("id", { count: "exact", head: true });

    if (totalAgentsErr) {
      return NextResponse.json({ ok: false, error: "DB error", details: totalAgentsErr.message }, { status: 500 });
    }

    const totalAgents = totalAgentsCount ?? 0;

    let q = supabase
      .from("aurik_agents")
      .select("id, niche, aurik_score, aurik_experience_capital, aurik_score_last_cycle_at, strategic_power_index", {
        count: "exact",
      })
      .order(orderCol, { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (niche.length > 0) q = q.eq("niche", niche);

    const { data, error, count } = await q;

    if (error) {
      return NextResponse.json({ ok: false, error: "DB error", details: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as AgentRow[];
    const filteredTotal = count ?? 0;

    const enriched = await Promise.all(
      rows.map(async (r, idx) => {
        const score = num(r.aurik_score);
        const exp = num(r.aurik_experience_capital);
        const spx = num(r.strategic_power_index);

        const rankInList = offset + idx + 1;

        // In-list rank is exact for the ordered slice.
        // If niche filter is present, list rank is niche-rank.
        const nicheRank = niche.length > 0 ? rankInList : null;
        const nichePercentile = niche.length > 0 ? percentileFromRank(rankInList, filteredTotal) : null;

        // Global rank: if niche filter is empty, rank is exact from list.
        // If niche filter is present, compute exact global rank via count query on orderCol.
        let globalRank = rankInList;
        let globalPercentile = percentileFromRank(globalRank, totalAgents);

        if (niche.length > 0) {
          const value = mode === "strategic" ? spx : score;

          const { count: higherCount, error: higherErr } = await supabase
            .from("aurik_agents")
            .select("id", { count: "exact", head: true })
            .gt(orderCol, value);

          if (!higherErr) {
            globalRank = (higherCount ?? 0) + 1;
            globalPercentile = percentileFromRank(globalRank, totalAgents);
          } else {
            globalRank = rankInList;
            globalPercentile = percentileFromRank(globalRank, totalAgents);
          }
        }

        return {
          id: r.id,
          niche: r.niche ?? null,
          score,
          experienceCapital: exp,
          strategicPowerIndex: spx,
          lastCycleAt: r.aurik_score_last_cycle_at ?? null,
          rank: {
            global: {
              rank: globalRank,
              total: totalAgents,
              percentile: globalPercentile,
            },
            niche: niche.length > 0
              ? {
                  niche,
                  rank: nicheRank ?? 0,
                  total: filteredTotal,
                  percentile: nichePercentile ?? 0,
                }
              : null,
          },
        };
      })
    );

    return NextResponse.json({
      ok: true,
      mode,
      niche: niche.length > 0 ? niche : null,
      limit,
      offset,
      totals: {
        global: totalAgents,
        niche: niche.length > 0 ? filteredTotal : null,
      },
      rows: enriched,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}
