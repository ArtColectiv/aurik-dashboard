import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");

    if (!agentId) {
      return NextResponse.json(
        { ok: false, error: "Missing agentId" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("agent_marketing_impact")
      .select("id, metric, action_type, created_at, baseline_value, post_value, status")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      agentId,
      impacts: (data ?? []).map((r: any) => ({
        id: r.id,
        metric: String(r.metric ?? ""),
        actionType: String(r.action_type ?? ""),
        createdAt: r.created_at,
        baselineValue: Number(r.baseline_value),
        postValue: r.post_value === null ? null : Number(r.post_value),
        status: String(r.status ?? ""),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}