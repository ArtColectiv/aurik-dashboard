// app/api/marketing/aurik-score/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");

    if (!agentId) {
      return NextResponse.json({ ok: false, error: "Missing agentId" }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from("aurik_agents")
      .select(
        "id, aurik_score, aurik_experience_capital, aurik_score_last_cycle_at, aurik_score_version"
      )
      .eq("id", agentId)
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Agent not found", details: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      version: AURIK_SCORE_VERSION,
      agentId: data.id,
      score: Number(data.aurik_score ?? 0),
      experienceCapital: Number(data.aurik_experience_capital ?? 0),
      lastCycleAt: data.aurik_score_last_cycle_at,
      scoreVersion: data.aurik_score_version ?? AURIK_SCORE_VERSION,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
