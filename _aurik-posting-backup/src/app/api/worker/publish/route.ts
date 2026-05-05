import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { postImageToInstagram } from "@/lib/instagramClient";

type DraftRow = {
  id: string;
  media_url: string | null;
  caption: string | null;
  agent_id?: string | null;
  agent_name?: string | null;
};

type JobRow = {
  id: string;
  user_id: string;
  draft_id: string;
  channel_connection_id: string;
  posting_post_drafts: DraftRow | DraftRow[] | null;
};

type AgentRow = {
  id: string;
  agent_name: string;
  auto_publish_enabled: boolean | null;
};

type PublishResult = {
  jobId: string;
  status?: string;
  postId?: string;
  agentName?: string;
  error?: string;
};

function normalizeDraft(value: JobRow["posting_post_drafts"]): DraftRow | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function resolveAgentPublishingAccess(
  supabase: ReturnType<typeof supabaseServer>,
  draft: DraftRow
): Promise<
  | { ok: true; agentId: string; agentName: string; autoPublishEnabled: boolean }
  | { ok: false; error: string }
> {
  if (draft.agent_id) {
    const { data, error } = await supabase
      .from("aurik_agents")
      .select("id, agent_name, auto_publish_enabled")
      .eq("id", draft.agent_id)
      .maybeSingle<AgentRow>();

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data) {
      return { ok: false, error: "Agent introuvable pour draft.agent_id" };
    }

    return {
      ok: true,
      agentId: data.id,
      agentName: data.agent_name,
      autoPublishEnabled: data.auto_publish_enabled === true,
    };
  }

  if (draft.agent_name) {
    const { data, error } = await supabase
      .from("aurik_agents")
      .select("id, agent_name, auto_publish_enabled")
      .eq("agent_name", draft.agent_name)
      .maybeSingle<AgentRow>();

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data) {
      return { ok: false, error: "Agent introuvable pour draft.agent_name" };
    }

    return {
      ok: true,
      agentId: data.id,
      agentName: data.agent_name,
      autoPublishEnabled: data.auto_publish_enabled === true,
    };
  }

  return {
    ok: false,
    error: "Draft sans agent_id ni agent_name. Publication auto refusée.",
  };
}

export async function POST() {
  const supabase = supabaseServer();

  const { data: jobs, error } = await supabase
    .from("posting_post_jobs")
    .select("id, user_id, draft_id, channel_connection_id, posting_post_drafts(*)")
    .eq("status", "queued")
    .limit(5)
    .returns<JobRow[]>();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ ok: true, message: "no jobs" }, { status: 200 });
  }

  const results: PublishResult[] = [];

  for (const job of jobs) {
    const draft = normalizeDraft(job.posting_post_drafts);

    if (!draft) {
      results.push({ jobId: job.id, error: "Missing draft relation" });
      continue;
    }

    if (!draft.media_url || !draft.caption) {
      results.push({ jobId: job.id, error: "Missing media_url or caption in draft" });
      continue;
    }

    const agentAccess = await resolveAgentPublishingAccess(supabase, draft);

    if (!agentAccess.ok) {
      results.push({ jobId: job.id, error: agentAccess.error });
      continue;
    }

    if (!agentAccess.autoPublishEnabled) {
      results.push({
        jobId: job.id,
        error: `Auto-publish disabled for agent ${agentAccess.agentName}`,
      });
      continue;
    }

    const igResult = await postImageToInstagram({
      imageUrl: draft.media_url,
      caption: draft.caption,
      agentName: agentAccess.agentName,
    });

    if (!igResult.ok || !igResult.postId) {
      results.push({
        jobId: job.id,
        error: igResult.error ?? "Instagram publish failed",
      });
      continue;
    }

    const { error: publishedInsertError } = await supabase.from("posting_published_posts").insert({
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

    if (publishedInsertError) {
      results.push({ jobId: job.id, error: publishedInsertError.message });
      continue;
    }

    const { error: jobUpdateError } = await supabase
      .from("posting_post_jobs")
      .update({ status: "published" })
      .eq("id", job.id);

    if (jobUpdateError) {
      results.push({ jobId: job.id, error: jobUpdateError.message });
      continue;
    }

    results.push({
      jobId: job.id,
      status: "published",
      postId: igResult.postId,
      agentName: agentAccess.agentName,
    });
  }

  return NextResponse.json(
    { ok: true, processed: results.length, results },
    { status: 200 }
  );
}