// app/api/marketing/aurik-score-history/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Factors = {
  dataVolume: number;
  feedbackAlignment: number;
  platformPerformance: number;
  consistency: number;
};

type HistoryRow = {
  agent_id: string;
  cycle_start_at: string;
  score: number;
  experience_capital: number;
  confidence: number | null;
  score_version: string;
  factors: Factors | null;
  created_at: string;
};

function getSupabasePublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function toInt(v: string | null, fallback: number) {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : fallback;
}

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeFactors(f: Factors | null): Factors {
  return {
    dataVolume: num(f?.dataVolume),
    feedbackAlignment: num(f?.feedbackAlignment),
    platformPerformance: num(f?.platformPerformance),
    consistency: num(f?.consistency),
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const agentId = searchParams.get("agentId")?.trim();
    const limit = toInt(searchParams.get("limit"), 24);

    if (!agentId) {
      return NextResponse.json(
        { ok: false, error: "Missing agentId" },
        { status: 400 }
      );
    }

    const supabase = getSupabasePublicClient();

    const { data, error } = await supabase
      .from("aurik_score_history")
      .select(
        `
        agent_id,
        cycle_start_at,
        score,
        experience_capital,
        confidence,
        score_version,
        factors,
        created_at
      `
      )
      .eq("agent_id", agentId)
      .order("cycle_start_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "DB error", details: error.message },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as unknown as HistoryRow[];

    const items = rows.map((r) => ({
      cycleStartAt: r.cycle_start_at,
      score: num(r.score),
      experienceCapital: num(r.experience_capital),
      confidence: r.confidence === null ? null : num(r.confidence),
      scoreVersion: r.score_version ?? "v1",
      factors: normalizeFactors(r.factors ?? null),
      createdAt: r.created_at,
    }));

    return NextResponse.json({
      ok: true,
      version: "v1",
      agentId,
      items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
