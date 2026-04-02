import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";

export async function POST() {
  const supabase = supabaseServer();

  // 1. récupérer les jobs en attente
  const { data: jobs, error } = await supabase
    .from("posting_post_jobs")
    .select("*")
    .eq("status", "queued")
    .limit(5);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message });
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ ok: true, message: "no jobs" });
  }

  const results: any[] = [];

  for (const job of jobs) {
    const fakePostId = `auto-${Date.now()}-${Math.random()}`;

    // 2. créer published post
    const { error: insertError } = await supabase
      .from("posting_published_posts")
      .insert({
        user_id: job.user_id,
        job_id: job.id,
        draft_id: job.draft_id,
        channel_connection_id: job.channel_connection_id,
        platform: "instagram",
        platform_post_id: fakePostId,
        platform_permalink: `https://instagram.com/p/${fakePostId}`,
        published_at: new Date().toISOString(),
        status: "published",
        raw_response: { worker: true },
      });

    if (insertError) {
      results.push({ jobId: job.id, error: insertError.message });
      continue;
    }

    // 3. update job
    const { error: updateError } = await supabase
      .from("posting_post_jobs")
      .update({ status: "published" })
      .eq("id", job.id);

    if (updateError) {
      results.push({ jobId: job.id, error: updateError.message });
      continue;
    }

    results.push({ jobId: job.id, status: "published" });
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}