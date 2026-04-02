// app/api/internal/autonomy-tick/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { computeScoreFromAgentMetrics } from "@/lib/aurik/score/scoreAdapterV1";
import { evaluateActionPolicy } from "@/lib/aurik/actions/policyEngine";
import { createMarketingBaseline } from "@/lib/aurik/impact/marketingImpactService";

// --- Autonomy daily limit curve (V1) ---
// Progression simple, lisible, facile à tuner plus tard.
// Objectif: plus l'agent est mature, plus il peut exécuter de ticks / jour.
function maxTicksPerDayFromLevel(level: number): number {
  const L = Math.max(0, Math.floor(level));

  // Courbe en paliers (stable & prédictible)
  // 0 -> 0 (optionnel) / 1 -> 1 / 2 -> 2 / 3 -> 3 / 4 -> 4 / 5 -> 6 / 6 -> 8 / 7 -> 10 / 8+ -> 12
  if (L <= 0) return 0;
  if (L === 1) return 1;
  if (L === 2) return 2;
  if (L === 3) return 3;
  if (L === 4) return 4;
  if (L === 5) return 6;
  if (L === 6) return 8;
  if (L === 7) return 10;
  return 12; // hard cap safe for MVP
}
const QuerySchema = z.object({
  agentId: z.string().uuid(),
  task: z.string().min(1).optional(),

  /**
   * Optional override (manual control). If omitted, system uses level-based maxPerDay.
   * Kept for debugging/demos.
   */
  maxPerDay: z.coerce.number().int().min(1).max(10).optional(),

  /**
   * Which eventType to use for maturity/level.
   * - combined: counts both human + autonomous work (recommended)
   * - task_executed_ui: human-only
   * - autonomy_tick: autonomous-only
   */
  maturityEventType: z.enum(["combined", "task_executed_ui", "autonomy_tick"]).optional(),
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ECOSYSTEM_ID = "default";

// ---------- Level model (discrete, anti-inflation) ----------
// ---------- Level model (extended curve V2) ----------
type AgentLevelInfo = {
  scoreTotal: number;
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  maxPerDay: number;
};

/**
 * Extended discrete maturity curve.
 * Smooth progression, anti-inflation, investor-friendly.
 */
function getAgentLevelFromScore(scoreTotal: number): AgentLevelInfo {
  const s = Math.max(0, Math.min(5, scoreTotal));

  let level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

  if (s < 1.0) level = 1;
  else if (s < 1.8) level = 2;
  else if (s < 2.6) level = 3;
  else if (s < 3.4) level = 4;
  else if (s < 4.0) level = 5;
  else if (s < 4.4) level = 6;
  else if (s < 4.8) level = 7;
  else level = 8;

  let maxPerDay: number;

  if (level === 1) maxPerDay = 1;
  else if (level === 2) maxPerDay = 2;
  else if (level === 3) maxPerDay = 3;
  else if (level === 4) maxPerDay = 4;
  else if (level === 5) maxPerDay = 6;
  else if (level === 6) maxPerDay = 8;
  else if (level === 7) maxPerDay = 10;
  else maxPerDay = 12; // hard cap safety

  return {
    scoreTotal: s,
    level,
    maxPerDay,
  };
}

// ---------- Task picking (MVP) ----------
function pickAutonomousTask(agentName: string): string {
  const name = agentName.trim().toLowerCase();

  if (name.includes("marketing")) {
    return [
      "Tu es un agent marketing pour une PME. Donne 5 actions concrètes à exécuter aujourd'hui pour générer plus de ventes.",
      "Structure: Action / Temps / Impact / KPI.",
    ].join("\n\n");
  }

  if (name.includes("finance")) {
    return [
      "Tu es un agent finance pour une PME. Donne 5 actions cette semaine pour améliorer cashflow et marge.",
      "Structure: Action / Impact financier / Risque.",
    ].join("\n\n");
  }

  return [
    "Tu es un agent Aurik pour une PME.",
    "Donne 5 actions concrètes aujourd'hui pour réduire les tâches et augmenter les revenus.",
    "Structure la réponse en: Action / Temps estimé / Impact attendu / Risque.",
  ].join("\n\n");
}

// ---------- DB helpers ----------
async function resolveAgentName(agentId: string) {
  const s = supabaseServer();

  const { data, error } = await s
    .from("aurik_agents")
    .select("agent_name")
    .eq("ecosystem_id", ECOSYSTEM_ID)
    .eq("id", agentId)
    .maybeSingle();

  if (error) {
    console.error("resolveAgentName error:", error.message);
    return null;
  }

  return data?.agent_name ?? null;
}

function startOfDayUTCISO(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function applyMaturityEventTypeFilter(query: any, maturityEventType: string) {
  if (maturityEventType === "combined") {
    return query.in("event_type", ["task_executed_ui", "autonomy_tick"]);
  }
  return query.eq("event_type", maturityEventType);
}

async function countTodayAutonomyTicks(agentId: string): Promise<number> {
  const s = supabaseServer();
  const { count, error } = await (s.from("agent_events") as any)
    .select("id", { count: "exact", head: true })
    .eq("event_type", "autonomy_tick")
    .eq("payload->>agent_id", agentId)
    .gte("created_at", startOfDayUTCISO());

  if (error) throw new Error(error.message);
  return typeof count === "number" ? count : 0;
}

/**
 * Minimal maturity score computation (V1-compatible, investor-friendly):
 * - tasks_count = exact count of events
 * - avg_output_length = simple mean over recent sample (up to maxEvents)
 *
 * IMPORTANT: We reuse your score engine via computeScoreFromAgentMetrics,
 * but we compute the metrics locally here to avoid internal endpoint coupling.
 */
async function computeMaturityScoreTotal(params: {
  agentId: string;
  maturityEventType: "combined" | "task_executed_ui" | "autonomy_tick";
  maxEvents: number;
}): Promise<number> {
  const s = supabaseServer();
  const startISO = undefined; // all-time maturity

  // 1) exact count
  let countQ = (s.from("agent_events") as any).select("id", {
    count: "exact",
    head: true,
  });
  countQ = applyMaturityEventTypeFilter(countQ, params.maturityEventType);
  countQ = countQ.eq("payload->>agent_id", params.agentId);

  if (startISO) countQ = countQ.gte("created_at", startISO);

  const { count, error: countError } = await countQ;
  if (countError) throw new Error(countError.message);

  const tasksCount = typeof count === "number" ? count : 0;

  // 2) sample avg output length (recent)
  const pageSize = 1000;
  const target = Math.min(params.maxEvents, 5000);

  let fetched = 0;
  let sum = 0;
  let seen = 0;

  while (fetched < target) {
    const from = fetched;
    const to = Math.min(fetched + pageSize - 1, target - 1);

    let pageQ = (s.from("agent_events") as any).select("payload,created_at");
    pageQ = applyMaturityEventTypeFilter(pageQ, params.maturityEventType);
    pageQ = pageQ.eq("payload->>agent_id", params.agentId);

    if (startISO) pageQ = pageQ.gte("created_at", startISO);

    pageQ = pageQ.order("created_at", { ascending: false }).range(from, to);

    const { data, error } = await pageQ;
    if (error) throw new Error(error.message);

    const rows: Array<{ payload: unknown }> = Array.isArray(data) ? data : [];
    if (rows.length === 0) break;

    for (const r of rows) {
      const p = r.payload as any;
      const v = p?.output_length;
      const n = typeof v === "number" && Number.isFinite(v) ? v : null;
      if (n !== null) {
        sum += n;
        seen += 1;
      }
    }

    fetched += rows.length;
    if (rows.length < to - from + 1) break;
  }

  const avgOutputLength = seen > 0 ? sum / seen : 0;

  const score = computeScoreFromAgentMetrics({
    tasks_count: tasksCount,
    avg_output_length: avgOutputLength,
  });

  return score.score;
}

// ---------- MAIN ----------
export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY missing" }, { status: 500 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = QuerySchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { agentId, task, maxPerDay, maturityEventType } = parsed.data;

    const agentName = await resolveAgentName(agentId);
    if (!agentName) {
      return NextResponse.json({ ok: false, error: "Agent not found", agentId }, { status: 404 });
    }

    const todayCount = await countTodayAutonomyTicks(agentId);

    // 1) Determine level-based dailyLimit unless overridden
    const maturityType = maturityEventType ?? "combined";

    const scoreTotal = await computeMaturityScoreTotal({
      agentId,
      maturityEventType: maturityType,
      maxEvents: 5000,
    });

    const levelInfo = getAgentLevelFromScore(scoreTotal);

    const dailyLimit = maxPerDay ?? levelInfo.maxPerDay;

        // ---- Policy Engine (AAP-1): decide execution mode (MVP: simulated action)
    // For now we only test the pipeline with a single safe action type.
    const simulatedActionType = "create_social_post";

    // TODO (next step): resolve activeSkillPacks from DB via hasSkillPackInstalled registry.
    // For now: inferred from agentName for demo (marketing/finance/ops).
    const inferredSkillPacks: string[] = (() => {
      const n = agentName.trim().toLowerCase();
      if (n.includes("marketing")) return ["marketing"];
      if (n.includes("finance")) return ["finance"];
      return ["operations"];
    })();

    const policyDecision = evaluateActionPolicy(simulatedActionType, {
      agentLevel: Number(levelInfo.level),
      activeSkillPacks: inferredSkillPacks,
    });

    // 2) Enforce daily limit
    if (todayCount >= dailyLimit) {
      const s = supabaseServer();
      await s.from("agent_events").insert([
        {
          ecosystem_id: ECOSYSTEM_ID,
          agent_name: agentName,
          event_type: "autonomy_tick_skipped",
          payload: {
            agent_id: agentId,
            reason: "daily_limit_reached",
            today_count: todayCount,
            limit: dailyLimit,
            maturity: {
              eventType: maturityType,
              scoreTotal: levelInfo.scoreTotal,
              level: levelInfo.level,
              maxPerDayFromLevel: levelInfo.maxPerDay,
              overrideApplied: typeof maxPerDay === "number",
                    policy: {
        simulatedActionType,
        decision: policyDecision,
        activeSkillPacks: inferredSkillPacks,
      },
            },
          },
        },
      ]);

      return NextResponse.json(
        {
          ok: false,
          skipped: true,
          reason: "daily_limit_reached",
          todayCount,
          limit: dailyLimit,
                 policy: {
          simulatedActionType,
          decision: policyDecision,
          activeSkillPacks: inferredSkillPacks,
        },
         maturity: {
            eventType: maturityType,
            scoreTotal: levelInfo.scoreTotal,
            level: levelInfo.level,
            maxPerDayFromLevel: levelInfo.maxPerDay,
            overrideApplied: typeof maxPerDay === "number",
          },
        },
        { status: 200 },
      );
    }

    // 3) Run tick
    const autonomousTask = task ?? pickAutonomousTask(agentName);

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            `You are the Aurik agent "${agentName}". ` +
            `This is an autonomous work tick. Provide structured, actionable output. ` +
            `Avoid fluff. Make it practical for a small business.`,
        },
        { role: "user", content: autonomousTask },
      ],
    });

    const result = completion.choices[0]?.message?.content?.trim() ?? "";
    const outputLength = result.length;

    const s = supabaseServer();
    const { error: insertError } = await s.from("agent_events").insert([
      {
        ecosystem_id: ECOSYSTEM_ID,
        agent_name: agentName,
        event_type: "autonomy_tick",
        payload: {
          agent_id: agentId,
          task: autonomousTask,
          result,
          output_length: outputLength,
          mode: "autonomous",
          maturity: {
            eventType: maturityType,
            scoreTotal: levelInfo.scoreTotal,
            level: levelInfo.level,
            dailyLimit,
            overrideApplied: typeof maxPerDay === "number",
          },
        },
      },
    ]);

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: "DB error inserting agent_events", message: insertError.message },
        { status: 500 },
      );
    }
// ---- Marketing Impact Baseline (V1)
if (
  policyDecision === "AUTO_EXECUTE" &&
  inferredSkillPacks.includes("marketing")
) {
  // MVP: fake baseline metric for now (will connect real data later)
  const fakeEngagementRate = 5; // %

  await createMarketingBaseline({
    agentId,
    actionType: simulatedActionType,
    metric: "engagement_rate",
    baselineValue: fakeEngagementRate,
  });
}
    return NextResponse.json(
      {
        ok: true,
        agentId,
        agentName: agentName.trim(),
        eventType: "autonomy_tick",
        outputLength,
        todayCount: todayCount + 1,
        limit: dailyLimit,
        maturity: {
          eventType: maturityType,
          scoreTotal: levelInfo.scoreTotal,
          level: levelInfo.level,
          maxPerDayFromLevel: levelInfo.maxPerDay,
          overrideApplied: typeof maxPerDay === "number",
        },
      },
      { status: 200 },
    );
  } catch (e: any) {
    console.error("/api/internal/autonomy-tick error:", e);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}