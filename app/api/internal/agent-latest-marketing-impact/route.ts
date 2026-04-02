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
      .select("id, created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No marketing impact found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      impactId: data[0].id,
      createdAt: data[0].created_at,
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