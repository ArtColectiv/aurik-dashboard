import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-api-key");

  if (apiKey !== process.env.AURIK_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { channelConnectionId, planCode } = body as {
      channelConnectionId?: string;
      planCode?: string;
    };

    if (!channelConnectionId || !planCode) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    const { data: connection, error: connectionError } = await supabase
      .from("posting_channel_connections")
      .select("user_id")
      .eq("id", channelConnectionId)
      .single();

    if (connectionError || !connection) {
      return NextResponse.json(
        { ok: false, error: "Invalid connection" },
        { status: 400 }
      );
    }

    const { data: plan, error: planError } = await supabase
      .from("posting_plans")
      .select("code, name, monthly_limit")
      .eq("code", planCode)
      .single();

    if (planError || !plan) {
      return NextResponse.json(
        { ok: false, error: "Invalid plan" },
        { status: 400 }
      );
    }

    const userId = connection.user_id as string;

    const { error: updateError } = await supabase
      .from("posting_users")
      .update({ plan_code: plan.code })
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      plan: {
        code: plan.code,
        name: plan.name,
        monthlyLimit: plan.monthly_limit,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}