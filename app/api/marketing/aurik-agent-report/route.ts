// app/api/marketing/aurik-agent-report/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const agentIdParam = searchParams.get("agentId")?.trim() ?? "";
    const agentNameParam = searchParams.get("agentName")?.trim() ?? "";
    const historyLimit = Math.max(1, Math.min(200, Number(searchParams.get("historyLimit") ?? 24) || 24));

    if (!agentIdParam && !agentNameParam) {
      return NextResponse.json({ ok: false, error: "Missing agentId or agentName" }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // 1) Resolve agentId
    let agentId = agentIdParam;

    if (!agentId && agentNameParam) {
      // We assume the DB column is `agent_name` (NOT `name`)
      const { data: agentRow, error: aErr } = await supabase
        .from("aurik_agents")
        .select("id, agent_name")
        .eq("agent_name", agentNameParam)
        .maybeSingle();

      if (aErr) {
        return NextResponse.json(
          { ok: false, error: "DB error resolving agent", details: aErr.message },
          { status: 500 }
        );
      }
      if (!agentRow?.id) {
        return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 });
      }

      agentId = String(agentRow.id);
    }

    // If someone passed a slug into agentId by mistake, try to resolve it too.
    if (agentId && !isUuid(agentId) && !agentNameParam) {
      const { data: agentRow, error: aErr } = await supabase
        .from("aurik_agents")
        .select("id, agent_name")
        .eq("agent_name", agentId)
        .maybeSingle();

      if (aErr) {
        return NextResponse.json(
          { ok: false, error: "DB error resolving agent", details: aErr.message },
          { status: 500 }
        );
      }
      if (!agentRow?.id) {
        return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 });
      }

      agentId = String(agentRow.id);
    }

    if (!agentId) {
      return NextResponse.json({ ok: false, error: "Missing agentId" }, { status: 400 });
    }

    // 2) Load report data (minimal: basic agent + latest history)
    const { data: agent, error: agentErr } = await supabase
      .from("aurik_agents")
      .select("id, agent_name, niche, created_at, aurik_score, aurik_experience_capital")
      .eq("id", agentId)
      .maybeSingle();

    if (agentErr) {
      return NextResponse.json({ ok: false, error: "DB error loading agent", details: agentErr.message }, { status: 500 });
    }
    if (!agent) {
      return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 });
    }

    const { data: history, error: histErr } = await supabase
      .from("aurik_score_history")
      .select("cycle_start_at, score, experience_capital, confidence, score_version, created_at")
      .eq("agent_id", agentId)
      .order("cycle_start_at", { ascending: false })
      .limit(historyLimit);

    if (histErr) {
      return NextResponse.json(
        { ok: false, error: "DB error loading history", details: histErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      version: "v1",
      agentId,
      agentName: agent.agent_name ?? null,
      agent,
      history: history ?? [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}
