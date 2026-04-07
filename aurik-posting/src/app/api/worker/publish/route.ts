import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { postImageToInstagram } from "@/lib/instagramClient";

export async function POST() {
  const supabase = supabaseServer();

  const { data: jobs, error } = await supabase
    .from("posting_post_jobs")
    .select("*, posting_post_drafts(*)")
    .eq("status", "queued")
    .limit(5);

  if (error) return NextResponse.json({ ok: false, error: error.message });
  if (!jobs || jobs.length === 0) return NextResponse.json({ ok: true, message: "no jobs" });

  const results: any[] = [];

  for (const job of jobs) {
    const draft = job.posting_post_drafts;

    if (!draft?.media_url || !draft?.caption) {
      results.push({ jobId: job.id, error: "Missing media_url or caption in draft" });
      continue;
    }

    const igResult = await postImageToInstagram({
      imageUrl: draft.media_url,
      caption: draft.caption,
      agentName: "aurik",
    });

    if (!igResult.ok) {
      results.push({ jobId: job.id, error: igResult.error });
      continue;
    }

    await supabase.from("posting_published_posts").insert({
      user_id: job.user_id,
      job_id: job.id,
      draft_id: job.draft_id,
      channel_connection_id: job.channel_connection_id,
      platform: "instagram",
      platform_post_id: igResult.postId,
      platform_permalink: `https://instagram.com/p/${igResult.postId}`,
      published_at: new Date().toISOString(),
      status: "published",
      raw_response: igResult,
    });

    await supabase.from("posting_post_jobs").update({ status: "published" }).eq("id", job.id);

    results.push({ jobId: job.id, status: "published", postId: igResult.postId });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}