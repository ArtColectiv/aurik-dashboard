import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";

export async function GET() {
  try {
    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("agent_events")
      .select("id, agent_name, event_type, payload, created_at")
      .eq("event_type", "autonomy_runner_cycle")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json({
        ok: false,
        error: error.message,
      });
    }

    const lastCycle = data && data.length > 0 ? data[0] : null;

    return NextResponse.json({
      ok: true,
      lastCycle,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Unhandled error",
    });
  }
}