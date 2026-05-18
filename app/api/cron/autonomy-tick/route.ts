// app/api/cron/autonomy-tick/route.ts
//
// Cron Vercel — exécuté toutes les heures.
// Récupère tous les agents actifs et déclenche un autonomy-tick pour chacun
// en appelant POST /api/internal/autonomy-tick.
//
// Auth : header "Authorization: Bearer $AURIK_CRON_SECRET"

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { DB } from "@/lib/aurik/db";

export const maxDuration = 300;

const ECOSYSTEM_ID = "default";

type AgentRow = {
  id: string;
  agent_name: string;
};

type TickResult = {
  agentId: string;
  agentName: string;
  ok: boolean;
  status?: number;
  error?: string;
};

export async function GET(req: Request) {
  const startedAt = Date.now();

  const authHeader = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "Missing server cron secret configuration" },
      { status: 500 }
    );
  }

  if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const supabase = supabaseServer();

    const { data: agentsRaw, error } = await supabase
      .from(DB.AGENTS_TABLE)
      .select("id, agent_name")
      .eq("ecosystem_id", ECOSYSTEM_ID)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch agents", details: error.message },
        { status: 500 }
      );
    }

    const agents = (agentsRaw ?? []) as AgentRow[];

    // Construit l'URL de base à partir de l'env Vercel ou de la requête entrante
    const baseUrl =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : new URL(req.url).origin;

    const tickUrl = `${baseUrl}/api/internal/autonomy-tick`;

    const results: TickResult[] = [];

    for (const agent of agents) {
      try {
        const res = await fetch(tickUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${expectedSecret}`,
          },
          body: JSON.stringify({ agentId: agent.id }),
        });

        const body = await res.json().catch(() => ({}));

        results.push({
          agentId: agent.id,
          agentName: agent.agent_name,
          ok: res.ok,
          status: res.status,
          error: res.ok
  ? undefined
  : JSON.stringify(body),
        });
      } catch (err) {
        results.push({
          agentId: agent.id,
          agentName: agent.agent_name,
          ok: false,
          error: err instanceof Error ? err.message : "Unhandled error",
        });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    const durationMs = Date.now() - startedAt;

    const summaryPayload = {
      mode: "cron",
      agentsChecked: agents.length,
      succeeded,
      failed,
      durationMs,
      results,
    };

    await supabase.from("agent_events").insert({
      agent_name: "autonomy-cron-tick",
      event_type: "autonomy_tick_cron_cycle",
      payload: summaryPayload,
    });

    return NextResponse.json({
  ok: true,
  mode: "cron",
  agentsChecked: agents.length,
  succeeded,
  failed,
  durationMs,
  results,
});
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unhandled error" },
      { status: 500 }
    );
  }
}
