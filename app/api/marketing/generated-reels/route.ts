import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { DB } from "@/lib/aurik/db";

function safeTrim(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface AgentLookupRow {
  id: string;
  agent_name: string;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const agentIdParam = safeTrim(url.searchParams.get("agentId"));
    const agentNameParam = safeTrim(url.searchParams.get("agentName"));

    if (!agentIdParam && !agentNameParam) {
      return NextResponse.json(
        { ok: false, error: "agentId ou agentName manquant." },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    let resolvedAgentId: string | null = agentIdParam;
    let resolvedAgentName: string | null = null;

    if (resolvedAgentId) {
      const { data: agentRow, error: agentErr } = await supabase
        .from(DB.AGENTS_TABLE)
        .select("id, agent_name")
        .eq("id", resolvedAgentId)
        .maybeSingle<AgentLookupRow>();

      if (agentErr) {
        return NextResponse.json(
          {
            ok: false,
            error: agentErr.message,
            details: agentErr.details ?? null,
          },
          { status: 500 }
        );
      }

      if (!agentRow?.id || !agentRow.agent_name) {
        return NextResponse.json(
          { ok: false, error: "Agent introuvable pour cet agentId." },
          { status: 404 }
        );
      }

      resolvedAgentId = agentRow.id;
      resolvedAgentName = agentRow.agent_name.trim();
    } else if (agentNameParam) {
      const { data: agentRow, error: agentErr } = await supabase
        .from(DB.AGENTS_TABLE)
        .select("id, agent_name")
        .eq("agent_name", agentNameParam)
        .maybeSingle<AgentLookupRow>();

      if (agentErr) {
        return NextResponse.json(
          {
            ok: false,
            error: agentErr.message,
            details: agentErr.details ?? null,
          },
          { status: 500 }
        );
      }

      if (!agentRow?.id || !agentRow.agent_name) {
        return NextResponse.json(
          { ok: false, error: "Agent introuvable pour cet agentName." },
          { status: 404 }
        );
      }

      resolvedAgentId = agentRow.id;
      resolvedAgentName = agentRow.agent_name.trim();
    }

    if (!resolvedAgentId) {
      return NextResponse.json(
        { ok: false, error: "Impossible de résoudre agent_id." },
        { status: 400 }
      );
    }

    const { data: reels, error } = await supabase
      .from("marketing_generated_reels")
      .select(
        [
          "id",
          "created_at",
          "agent_id",
          "agent_name",
          "prompt_subject",
          "platform",
          "goal_type",
          "goal_description",
          "script_steps",
          "caption",
          "call_to_action",
          "hashtags",
          "cover_prompt",
          "video_url",
          "video_storage_path",
          "status",
          "error_message",
        ].join(",")
      )
      .eq("agent_id", resolvedAgentId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          details: error.details ?? null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        agentId: resolvedAgentId,
        agentName: resolvedAgentName,
        reels: reels ?? [],
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}