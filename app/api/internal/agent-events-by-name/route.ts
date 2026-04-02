// app/api/internal/agent-events-by-name/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/aurik/supabaseServer";

const QuerySchema = z.object({
  agentName: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const agentName = url.searchParams.get("agentName") ?? "";
    const limit = url.searchParams.get("limit") ?? "50";

    const parsed = QuerySchema.safeParse({ agentName, limit });
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid query params", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const s = supabaseServer();

    const { data, error } = await (s.from("agent_events") as any)
      .select("created_at,event_type,agent_name,payload")
      .eq("agent_name", parsed.data.agentName)
      .order("created_at", { ascending: false })
      .limit(parsed.data.limit ?? 50);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "DB error reading agent_events", message: error.message },
        { status: 500 },
      );
    }

    const rows = Array.isArray(data) ? data : [];

    // Extract distinct payload keys + sample agent_id variants
    const payloadKeys = new Set<string>();
    const agentIds = new Set<string>();

    for (const r of rows) {
      const p = r.payload ?? {};
      if (p && typeof p === "object") {
        for (const k of Object.keys(p)) payloadKeys.add(k);
        const maybe =
          (typeof p.agent_id === "string" && p.agent_id) ||
          (typeof p.agentId === "string" && p.agentId) ||
          (typeof p.agent_uuid === "string" && p.agent_uuid);
        if (maybe) agentIds.add(maybe);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        agentName: parsed.data.agentName,
        rows: rows.length,
        distinctPayloadKeys: Array.from(payloadKeys).sort(),
        distinctAgentIdsInPayload: Array.from(agentIds).sort(),
        sample: rows.slice(0, 5),
      },
      { status: 200 },
    );
  } catch (e: any) {
    console.error("/api/internal/agent-events-by-name error:", e);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}