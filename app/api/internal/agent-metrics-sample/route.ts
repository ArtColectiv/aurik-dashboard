// app/api/internal/agent-metrics-sample/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";

export async function GET() {
  try {
    const s = supabaseServer();

    const { data, error } = await (s as any)
      .from("agent_metrics")
      .select("*")
      .limit(1);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "DB error reading agent_metrics sample", message: error.message },
        { status: 500 },
      );
    }

    const sampleRow = Array.isArray(data) && data.length > 0 ? data[0] : null;

    return NextResponse.json(
      {
        ok: true,
        found: Boolean(sampleRow),
        keys: sampleRow ? Object.keys(sampleRow).sort() : [],
        sampleRow,
        note:
          sampleRow
            ? "These keys reflect real columns in public.agent_metrics."
            : "No rows in agent_metrics. If empty, paste the column list from Supabase Table Editor > agent_metrics.",
      },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}