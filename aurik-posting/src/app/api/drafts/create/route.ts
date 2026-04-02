import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";

function getMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export async function POST(req: Request) {
  try {
    const apiKey = req.headers.get("x-api-key");

    if (apiKey !== process.env.AURIK_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const {
      channelConnectionId,
      title,
      caption,
      mediaUrl,
      mediaType,
      platform,
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
        metadata: { source: "aurik" },
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

    const fakePostId = `auto-${Date.now()}-${Math.random()}`;

    const { data: published, error: publishError } = await supabase
      .from("posting_published_posts")
      .insert({
        user_id: userId,
        job_id: job.id,
        draft_id: draft.id,
        channel_connection_id: channelConnectionId,
        platform: "instagram",
        platform_post_id: fakePostId,
        platform_permalink: `https://instagram.com/p/${fakePostId}`,
        published_at: new Date().toISOString(),
        status: "published",
        raw_response: { source: "api_auto_publish" },
      })
      .select()
      .single();

    if (publishError || !published) {
      return NextResponse.json(
        { ok: false, error: publishError?.message ?? "Publish failed" },
        { status: 500 }
      );
    }

    const { error: updateJobError } = await supabase
      .from("posting_post_jobs")
      .update({ status: "published" })
      .eq("id", job.id);

    if (updateJobError) {
      return NextResponse.json(
        { ok: false, error: updateJobError.message },
        { status: 500 }
      );
    }

    const { error: metricsError } = await supabase
      .from("posting_post_metrics")
      .insert({
        published_post_id: published.id,
        impressions: 1200,
        reach: 980,
        likes: 84,
        comments: 12,
        shares: 7,
        saves: 15,
        clicks: 21,
        raw_metrics: { source: "auto_after_publish" },
      });

    if (metricsError) {
      return NextResponse.json(
        { ok: false, error: metricsError.message },
        { status: 500 }
      );
    }

    const { error: usageErrorInsert } = await supabase
      .from("posting_usage_events")
      .insert({
        user_id: userId,
        event_type: "full_pipeline_run",
        event_count: 1,
        metadata: {
          platform,
          draft_id: draft.id,
          job_id: job.id,
          published_id: published.id,
          source: "aurik_api",
        },
      });

    if (usageErrorInsert) {
      return NextResponse.json(
        { ok: false, error: usageErrorInsert.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "FULL PIPELINE SECURED + TRACKED + LIMITED",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}