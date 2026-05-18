import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function getMonthRange() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0)
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

type CreateDraftBody = {
  channelConnectionId?: string;
  title?: string | null;
  caption?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  platform?: string;
  agentName?: string | null;
  agentId?: string;
agent_id?: string;
agent_name?: string;
};

export async function POST(req: Request) {
  try {
    const apiKey = req.headers.get("x-api-key");

    if (apiKey !== process.env.AURIK_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as CreateDraftBody;
    console.log("[CREATE DRAFT BODY]", body);

    const {
      channelConnectionId,
      title,
      caption,
      mediaUrl,
      mediaType,
      platform,
      agentName,
    } = body;

    if (!channelConnectionId || !caption || !platform) {
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

    const userId = connection.user_id as string;

    const { data: postingUser, error: postingUserError } = await supabase
      .from("posting_users")
      .select("plan_code")
      .eq("id", userId)
      .single();

    if (postingUserError || !postingUser) {
      return NextResponse.json(
        { ok: false, error: "Posting user not found" },
        { status: 400 }
      );
    }

    const { data: plan, error: planError } = await supabase
      .from("posting_plans")
      .select("monthly_limit")
      .eq("code", postingUser.plan_code)
      .single();

    if (planError || !plan) {
      return NextResponse.json(
        { ok: false, error: "Plan not found" },
        { status: 400 }
      );
    }

    const { start, end } = getMonthRange();

    const { data: usageRows, error: usageError } = await supabase
      .from("posting_usage_events")
      .select("event_count")
      .eq("user_id", userId)
      .eq("event_type", "full_pipeline_run")
      .gte("created_at", start)
      .lt("created_at", end);

    if (usageError) {
      return NextResponse.json(
        { ok: false, error: usageError.message },
        { status: 500 }
      );
    }

    const monthlyUsage = (usageRows ?? []).reduce(
      (sum, row) => sum + (row.event_count ?? 0),
      0
    );

    if (monthlyUsage >= plan.monthly_limit) {
      return NextResponse.json(
        { ok: false, error: "Monthly plan limit reached" },
        { status: 403 }
      );
    }

    const metadata = {
      source: "aurik",
      agent_name: agentName?.trim() || null,
    };

    const { data: draft, error: draftError } = await supabase
      .from("posting_post_drafts")
      .insert({
        user_id: userId,
        channel_connection_id: channelConnectionId,
        title: title ?? null,
        caption,
        media_url: mediaUrl ?? null,
        media_type: mediaType ?? "image",
        platform,
        status: "draft",
        agent_id: body.agentId ?? body.agent_id ?? null,
agent_name: body.agentName ?? body.agent_name ?? null,
        metadata,
      })
      .select()
      .single();

    if (draftError || !draft) {
      return NextResponse.json(
        { ok: false, error: draftError?.message ?? "Draft creation failed" },
        { status: 500 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("posting_post_jobs")
      .insert({
        user_id: userId,
        draft_id: draft.id,
        channel_connection_id: channelConnectionId,
        publish_mode: "now",
        status: "queued",
      })
      .select()
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { ok: false, error: jobError?.message ?? "Job creation failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Draft and job created",
      draftId: draft.id,
      jobId: job.id,
      agentName: metadata.agent_name,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}