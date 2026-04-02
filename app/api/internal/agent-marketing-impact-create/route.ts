import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";

type CreateBody = {
  agentId?: string;
  metric?: string;
  actionType?: string;
  baselineValue?: number;
  status?: string;
  meta?: Record<string, unknown>;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBody;

    const agentId = body.agentId;
    const metric = (body.metric ?? "").trim();
    const actionType = (body.actionType ?? "").trim();
    const baselineValue = body.baselineValue;

    const status = (body.status ?? "active").trim();

    if (!agentId) {
      return NextResponse.json({ ok: false, error: "Missing agentId" }, { status: 400 });
    }
    if (!metric) {
      return NextResponse.json({ ok: false, error: "Missing metric" }, { status: 400 });
    }
    if (!actionType) {
      return NextResponse.json({ ok: false, error: "Missing actionType" }, { status: 400 });
    }
    if (typeof baselineValue !== "number" || !Number.isFinite(baselineValue) || baselineValue <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid baselineValue (must be > 0)" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    // Optional meta: only if column exists (you added meta to marketing impacts earlier)
    const insertPayload: Record<string, unknown> = {
      agent_id: agentId,
      metric,
      action_type: actionType,
      baseline_value: baselineValue,
      post_value: baselineValue, // start at baseline
      status,
    };

    if (body.meta && typeof body.meta === "object") {
      insertPayload.meta = body.meta;
    }

    const { data, error } = await supabase
      .from("agent_marketing_impact")
      .insert(insertPayload)
      .select("id, created_at, metric, action_type, baseline_value, post_value, status")
      .limit(1);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ ok: false, error: "Insert failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      impact: {
        id: data[0].id,
        createdAt: data[0].created_at,
        metric: data[0].metric,
        actionType: data[0].action_type,
        baselineValue: Number(data[0].baseline_value),
        postValue: data[0].post_value === null ? null : Number(data[0].post_value),
        status: data[0].status,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}