import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import {
  runExperimentAutonomy,
  type AutonomyDebugInfo,
} from "@/lib/aurik/autonomy/experimentAutonomy";
import { DB } from "@/lib/aurik/db";

type AgentRow = {
  agent_name: string;
};

type RunnerResult = {
  agentName: string;
  ok: boolean;
  action?: "experiment_started" | "no_action";
  decision?: "auto_run" | "safe_override" | "no_action";
  riskLevel?: "low" | "medium";
  reason?: string;
  experimentKey?: string;
  impactId?: string;
  debug?: AutonomyDebugInfo;
  error?: string;
};

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const authHeader = req.headers.get("authorization");
    const expectedSecret = process.env.AURIK_CRON_SECRET;

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

    const supabase = supabaseServer();

    const { data: agentsRaw, error } = await supabase
      .from(DB.AGENTS_TABLE)
      .select("agent_name")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch agents",
          details: error.message,
        },
        { status: 500 }
      );
    }

    const agentSet = new Set<string>();

    for (const row of (agentsRaw ?? []) as AgentRow[]) {
      const cleanedName =
        typeof row.agent_name === "string" ? row.agent_name.trim() : "";

      if (cleanedName) {
        agentSet.add(cleanedName);
      }
    }

    const agents = Array.from(agentSet).map((name) => ({
      agent_name: name,
    }));

    const results: RunnerResult[] = [];

    for (const agent of agents) {
      const agentName = agent.agent_name;

      try {
        const res = await runExperimentAutonomy(agentName);

        if (res.ok) {
          results.push({
            agentName,
            ok: true,
            action: res.action,
            decision: res.decision,
            riskLevel: res.riskLevel,
            reason: res.reason,
            experimentKey: res.experimentKey,
            impactId: res.impactId,
            debug: res.debug,
          });
        } else {
          results.push({
            agentName,
            ok: false,
            error: res.error ?? "Unknown error",
          });
        }
      } catch (err) {
        results.push({
          agentName,
          ok: false,
          error: err instanceof Error ? err.message : "Unhandled error",
        });
      }
    }

    const experimentsTriggered = results.filter(
      (result) => result.ok && result.action === "experiment_started"
    ).length;

    const normalAutoRuns = results.filter(
      (result) =>
        result.ok &&
        result.action === "experiment_started" &&
        result.decision === "auto_run"
    ).length;

    const safeOverrideRuns = results.filter(
      (result) =>
        result.ok &&
        result.action === "experiment_started" &&
        result.decision === "safe_override"
    ).length;

    const noActionCount = results.filter(
      (result) => result.ok && result.action === "no_action"
    ).length;

    const failedAgents = results.filter((result) => !result.ok).length;
    const durationMs = Date.now() - startedAt;

    const summaryPayload = {
      agentsChecked: results.length,
      experimentsTriggered,
      normalAutoRuns,
      safeOverrideRuns,
      noActionCount,
      failedAgents,
      durationMs,
      results,
    };

    await supabase.from("agent_events").insert({
      agent_name: "autonomy-runner",
      event_type: "autonomy_runner_cycle",
      payload: summaryPayload,
    });

    return NextResponse.json({
      ok: true,
      agentsChecked: results.length,
      experimentsTriggered,
      normalAutoRuns,
      safeOverrideRuns,
      noActionCount,
      failedAgents,
      durationMs,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unhandled error",
      },
      { status: 500 }
    );
  }
}