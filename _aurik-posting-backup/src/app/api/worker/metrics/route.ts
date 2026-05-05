import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST() {
  const supabase = supabaseServer();

  const { data: publishedPosts, error } = await supabase
    .from("posting_published_posts")
    .select("id")
    .limit(10);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message });
  }

  if (!publishedPosts || publishedPosts.length === 0) {
    return NextResponse.json({ ok: true, message: "no published posts" });
  }

  const results: Array<{ publishedPostId: string; status: string }> = [];

  for (const post of publishedPosts) {
    const { data: existingMetric, error: existingError } = await supabase
      .from("posting_post_metrics")
      .select("id")
      .eq("published_post_id", post.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ ok: false, error: existingError.message });
    }

    if (existingMetric) {
      results.push({
        publishedPostId: post.id,
        status: "already_exists",
      });
      continue;
    }

    const { error: insertError } = await supabase
      .from("posting_post_metrics")
      .insert({
        published_post_id: post.id,
        impressions: 1200,
        reach: 980,
        likes: 84,
        comments: 12,
        shares: 7,
        saves: 15,
        clicks: 21,
        raw_metrics: { worker: true },
      });

    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message });
    }

    results.push({
      publishedPostId: post.id,
      status: "created",
    });
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}