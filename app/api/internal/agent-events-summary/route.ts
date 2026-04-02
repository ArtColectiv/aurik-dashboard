// app/api/internal/agent-events-summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/aurik/supabaseServer";

const QuerySchema = z.object({
  agentId: z.string().uuid(),
  // Limite de scan (sécurité)
  maxRows: z.coerce.number().int().min(1).max(20000).optional(),
});

const DEFAULT_MAX_ROWS = 5000;

function getString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const agentId = url.searchParams.get("agentId") ?? "";
    const maxRows = url.searchParams.get("maxRows") ?? `${DEFAULT_MAX_ROWS}`;

    const parsed = QuerySchema.safeParse({ agentId, maxRows });
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid query params", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const s = supabaseServer();
    const limit = parsed.data.maxRows ?? DEFAULT_MAX_ROWS;

    // Pull recent rows and summarize locally (no RPC assumptions).
    const { data, error } = await (s.from("agent_events") as any)
      .select("event_type,payload,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "DB error reading agent_events", message: error.message },
        { status: 500 },
      );
    }

    const rows: Array<{ event_type: string; payload: any; created_at: string }> = Array.isArray(data)
      ? data
      : [];

    // Filter to the ones that match the agent (try common payload keys)
    const matched = [];
    const typeCounts: Record<string, number> = {};
    const agentKeysSeen: Record<string, number> = {};
    const outputKeysSeen: Record<string, number> = {};

    for (const r of rows) {
      const p = r.payload ?? {};
      const candidates = {
        agent_id: getString(p.agent_id),
        agentId: getString(p.agentId),
        agent_uuid: getString(p.agent_uuid),
        agent: getString(p.agent),
      };

      const agentValue =
        candidates.agent_id ?? candidates.agentId ?? candidates.agent_uuid ?? candidates.agent;

      if (agentValue !== agentId) continue;

      matched.push(r);

      typeCounts[r.event_type] = (typeCounts[r.event_type] ?? 0) + 1;

      for (const k of Object.keys(candidates)) {
        if (candidates[k as keyof typeof candidates]) {
          agentKeysSeen[k] = (agentKeysSeen[k] ?? 0) + 1;
        }
      }

      // output length key candidates
      const outCandidates = ["output_length", "outputLength", "length", "chars"];
      for (const k of outCandidates) {
        if (typeof p?.[k] === "number" || typeof p?.[k] === "string") {
          outputKeysSeen[k] = (outputKeysSeen[k] ?? 0) + 1;
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        agentId,
        scannedRows: rows.length,
        matchedRows: matched.length,
        eventTypeCounts: typeCounts,
        agentIdKeysSeen: agentKeysSeen,
        outputLengthKeysSeen: outputKeysSeen,
        sampleMatchedRows: matched.slice(0, 3), // for inspection
        note:
          matched.length === 0
            ? "No events matched this agentId in the scanned window. Either the agent has no events yet, or payload uses a different key."
            : "Counts reflect only matched events for this agentId.",
      },
      { status: 200 },
    );
  } catch (e: any) {
    console.error("/api/internal/agent-events-summary error:", e);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}