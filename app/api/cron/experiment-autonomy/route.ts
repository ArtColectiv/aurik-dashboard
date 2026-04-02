// app/api/cron/experiment-autonomy/route.ts
//
// Route appelée automatiquement par Vercel Cron toutes les heures.
// Itère sur tous les agents actifs et déclenche runExperimentAutonomy pour chacun.
//
// Auth : header "Authorization: Bearer $AURIK_CRON_SECRET"
// Vercel envoie automatiquement ce header si CRON_SECRET est configuré —
// utiliser la même valeur que AURIK_CRON_SECRET dans les variables d'env Vercel.

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import {
  runExperimentAutonomy,
  type AutonomyDebugInfo,
} from "@/lib/aurik/autonomy/experimentAutonomy";
import { DB } from "@/lib/aurik/db";

// Augmente la durée max d'exécution pour traiter de nombreux agents (Vercel Pro)
export const maxDuration = 300;

type AgentRow = {
  agent_name: string;
  is_active: boolean | null;
};

type CronResult = {
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

export async function GET(req: Request) {
  const startedAt = Date.now();

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

  try {
    const supabase = supabaseServer();

    // Récupère tous les agents actifs (is_active = true ou colonne absente → inclus)
    const { data: agentsRaw, error } = await supabase
      .from(DB.AGENTS_TABLE)
      .select("agent_name, is_active")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch agents", details: error.message },
        { status: 500 }
      );
    }

    const rows = (agentsRaw ?? []) as AgentRow[];

    // Déduplique et filtre les agents actifs
    // is_active absent (null) → considéré actif pour rétrocompatibilité
    const agentNames = Array.from(
      new Set(
        rows
          .filter((row) => row.is_active !== false)
          .map((row) =>
            typeof row.agent_name === "string" ? row.agent_name.trim() : ""
          )
          .filter(Boolean)
      )
    );

    const results: CronResult[] = [];

    for (const agentName of agentNames) {
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
          results.push({ agentName, ok: false, error: res.error ?? "Unknown error" });
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
      (r) => r.ok && r.action === "experiment_started"
    ).length;

    const normalAutoRuns = results.filter(
      (r) => r.ok && r.action === "experiment_started" && r.decision === "auto_run"
    ).length;

    const safeOverrideRuns = results.filter(
      (r) => r.ok && r.action === "experiment_started" && r.decision === "safe_override"
    ).length;

    const noActionCount = results.filter(
      (r) => r.ok && r.action === "no_action"
    ).length;

    const failedAgents = results.filter((r) => !r.ok).length;
    const durationMs = Date.now() - startedAt;

    const summaryPayload = {
      mode: "cron",
      agentsChecked: agentNames.length,
      experimentsTriggered,
      normalAutoRuns,
      safeOverrideRuns,
      noActionCount,
      failedAgents,
      durationMs,
      results,
    };

    await supabase.from("agent_events").insert({
      agent_name: "autonomy-cron",
      event_type: "autonomy_cron_cycle",
      payload: summaryPayload,
    });

    return NextResponse.json({
      ok: true,
      mode: "cron",
      agentsChecked: agentNames.length,
      experimentsTriggered,
      normalAutoRuns,
      safeOverrideRuns,
      noActionCount,
      failedAgents,
      durationMs,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unhandled error" },
      { status: 500 }
    );
  }
}
