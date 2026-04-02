// app/api/internal/agent-score-v1/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { computeScoreFromAgentMetrics } from "@/lib/aurik/score/scoreAdapterV1";

const QuerySchema = z.object({
  agentId: z.string().uuid(),
  ecosystemId: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  maxEvents: z.coerce.number().int().min(1).max(20000).optional(),
  pulseDays: z.coerce.number().int().min(1).max(365).optional(),
});

const DEFAULT_ECOSYSTEM_ID = "default";
const DEFAULT_EVENT_TYPE = "task_executed_ui";
const DEFAULT_MAX_EVENTS = 5000;

const CORE_WEIGHT = 0.7;
const PULSE_WEIGHT = 0.3;
const MARKETING_WEIGHT = 0.2;
const OPERATIONS_WEIGHT = 0.75;
const EXPERIENCE_WEIGHT = 0.05;

// Trim settings
const TRIM_FRACTION = 0.1;
const MIN_VALUES_FOR_TRIM = 10;

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function extractOutputLength(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  return toFiniteNumber(p.output_length);
}

function applyEventTypeFilter(query: any, eventType: string) {
  if (eventType === "combined") {
    return query.in("event_type", ["task_executed_ui", "autonomy_tick"]);
  }
  return query.eq("event_type", eventType);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function trimmedMean(values: number[], trimFraction: number): number {
  const n = values.length;
  if (n === 0) return 0;

  const tf = clamp(trimFraction, 0, 0.49);

  if (n < MIN_VALUES_FOR_TRIM || tf <= 0) {
    return mean(values);
  }

  const sorted = [...values].sort((a, b) => a - b);
  const k = Math.floor(n * tf);

  if (k * 2 >= n) return mean(values);

  let s = 0;
  let count = 0;
  for (let i = k; i < n - k; i++) {
    s += sorted[i]!;
    count += 1;
  }
  return count > 0 ? s / count : mean(values);
}

type MetricsOk = {
  ok: true;
  tasks_count: number;
  avg_output_length: number;
  exact_count: number | null;
  sample_size: number;
};

type MetricsErr = {
  ok: false;
  status: 500;
  error: string;
  message: string;
};

type MetricsResult = MetricsOk | MetricsErr;

type MarketingScoreResponse =
  | {
      ok: true;
      marketingScore?: number;
      impacts?: Array<unknown>;
    }
  | {
      ok: false;
      error?: string;
      message?: string;
    };

type AgentExperienceRow = {
  aurik_experience_capital: number | null;
};

async function computeMetricsFromEvents(params: {
  agentId: string;
  eventType: string;
  maxEvents: number;
  sinceISO?: string;
}): Promise<MetricsResult> {
  const s = supabaseServer();

  let countQuery = (s.from("agent_events") as any).select("id", {
    count: "exact",
    head: true,
  });

  countQuery = applyEventTypeFilter(countQuery, params.eventType);
  countQuery = countQuery.eq("payload->>agent_id", params.agentId);

  if (params.sinceISO) {
    countQuery = countQuery.gte("created_at", params.sinceISO);
  }

  const { count: exactCount, error: countError } = await countQuery;

  if (countError) {
    return {
      ok: false,
      status: 500,
      error: "DB error counting agent_events",
      message: countError.message,
    };
  }

  const pageSize = 1000;
  const target = Math.min(params.maxEvents, DEFAULT_MAX_EVENTS);

  let fetched = 0;
  const outputLengths: number[] = [];

  while (fetched < target) {
    const from = fetched;
    const to = Math.min(fetched + pageSize - 1, target - 1);

    let pageQuery = (s.from("agent_events") as any).select("payload,created_at");

    pageQuery = applyEventTypeFilter(pageQuery, params.eventType);
    pageQuery = pageQuery.eq("payload->>agent_id", params.agentId);

    if (params.sinceISO) {
      pageQuery = pageQuery.gte("created_at", params.sinceISO);
    }

    pageQuery = pageQuery
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data, error } = await pageQuery;

    if (error) {
      return {
        ok: false,
        status: 500,
        error: "DB error reading agent_events",
        message: error.message,
      };
    }

    const rows: Array<{ payload: unknown }> = Array.isArray(data) ? data : [];
    if (rows.length === 0) break;

    for (const r of rows) {
      const outLen = extractOutputLength(r.payload);
      if (outLen !== null) {
        outputLengths.push(outLen);
      }
    }

    fetched += rows.length;

    if (rows.length < to - from + 1) break;
  }

  const avgOutputLength = trimmedMean(outputLengths, TRIM_FRACTION);

  return {
    ok: true,
    tasks_count: typeof exactCount === "number" ? exactCount : fetched,
    avg_output_length: avgOutputLength,
    exact_count: typeof exactCount === "number" ? exactCount : null,
    sample_size: fetched,
  };
}

async function fetchMarketingScore(
  req: NextRequest,
  agentId: string,
): Promise<{ score: number; impactsCount: number }> {
  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(
      `${origin}/api/internal/agent-marketing-score?agentId=${encodeURIComponent(agentId)}&n=10`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

    if (!res.ok) {
      return { score: 0, impactsCount: 0 };
    }

    const json = (await res.json()) as MarketingScoreResponse;

    if (!json.ok) {
      return { score: 0, impactsCount: 0 };
    }

    const rawScore =
      typeof json.marketingScore === "number" && Number.isFinite(json.marketingScore)
        ? json.marketingScore
        : 0;

    const impactsCount = Array.isArray(json.impacts) ? json.impacts.length : 0;

    return {
      score: clamp(rawScore, 0, 5),
      impactsCount,
    };
  } catch {
    return { score: 0, impactsCount: 0 };
  }
}

async function fetchExperienceCapital(agentId: string): Promise<number> {
  try {
    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("aurik_agents")
      .select("aurik_experience_capital")
      .eq("id", agentId)
      .maybeSingle<AgentExperienceRow>();

    if (error) return 0;

    const raw = data?.aurik_experience_capital;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }

    return 0;
  } catch {
    return 0;
  }
}

function normalizeExperienceToCoreScale(
  experienceCapital: number,
  maxScore: number,
): number {
  if (!Number.isFinite(experienceCapital) || experienceCapital <= 0) {
    return 0;
  }

  // petit bonus progressif, plafonné
  const normalized = Math.min(Math.log10(experienceCapital + 1) / 2, 1);

  return normalized * maxScore;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const agentId = url.searchParams.get("agentId") ?? "";
    const ecosystemId =
      url.searchParams.get("ecosystemId") ?? DEFAULT_ECOSYSTEM_ID;
    const eventType =
      url.searchParams.get("eventType") ?? DEFAULT_EVENT_TYPE;

    const maxEventsRaw = url.searchParams.get("maxEvents") ?? "";
    const maxEvents =
      maxEventsRaw.trim() === "" ? DEFAULT_MAX_EVENTS : Number(maxEventsRaw);

    const pulseDaysRaw = url.searchParams.get("pulseDays") ?? "";
    const pulseDays = pulseDaysRaw.trim() === "" ? 30 : Number(pulseDaysRaw);

    const parsed = QuerySchema.safeParse({
      agentId,
      ecosystemId,
      eventType,
      maxEvents,
      pulseDays,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid query params", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const coreRes = await computeMetricsFromEvents({
      agentId,
      eventType,
      maxEvents,
    });

    if (!coreRes.ok) {
      return NextResponse.json(
        { ok: false, error: coreRes.error, message: coreRes.message },
        { status: coreRes.status },
      );
    }

    const since = new Date(Date.now() - pulseDays * 24 * 60 * 60 * 1000);
    const pulseRes = await computeMetricsFromEvents({
      agentId,
      eventType,
      maxEvents,
      sinceISO: since.toISOString(),
    });

    if (!pulseRes.ok) {
      return NextResponse.json(
        { ok: false, error: pulseRes.error, message: pulseRes.message },
        { status: pulseRes.status },
      );
    }

    const core = computeScoreFromAgentMetrics({
      tasks_count: coreRes.tasks_count,
      avg_output_length: coreRes.avg_output_length,
    });

    const pulse = computeScoreFromAgentMetrics({
      tasks_count: pulseRes.tasks_count,
      avg_output_length: pulseRes.avg_output_length,
    });

    const maxScore = core.meta.maxScore;

    const operationsScore = clamp(
      CORE_WEIGHT * core.score + PULSE_WEIGHT * pulse.score,
      0,
      maxScore,
    );

    const operationsConfidence = clamp(
      CORE_WEIGHT * core.confidence + PULSE_WEIGHT * pulse.confidence,
      0,
      1,
    );

    const { score: marketingScore, impactsCount: marketingImpactsCount } =
      await fetchMarketingScore(req, agentId);

    const marketingNormalizedToCoreScale = (marketingScore / 5) * maxScore;

    const experienceCapital = await fetchExperienceCapital(agentId);
    const experienceNormalizedToCoreScale = normalizeExperienceToCoreScale(
      experienceCapital,
      maxScore,
    );

    const totalScore = clamp(
      OPERATIONS_WEIGHT * operationsScore +
        MARKETING_WEIGHT * marketingNormalizedToCoreScale +
        EXPERIENCE_WEIGHT * experienceNormalizedToCoreScale,
      0,
      maxScore,
    );

    const marketingConfidence = marketingImpactsCount > 0 ? 1 : 0;
    const experienceConfidence = experienceCapital > 0 ? 1 : 0;

    const totalConfidence = clamp(
      OPERATIONS_WEIGHT * operationsConfidence +
        MARKETING_WEIGHT * marketingConfidence +
        EXPERIENCE_WEIGHT * experienceConfidence,
      0,
      1,
    );

    const coreSampled =
      coreRes.exact_count !== null && coreRes.sample_size < coreRes.exact_count;

    const pulseSampled =
      pulseRes.exact_count !== null && pulseRes.sample_size < pulseRes.exact_count;

    return NextResponse.json(
      {
        ok: true,
        agentId,
        ecosystemId,
        source: {
          table: "agent_events",
          eventType,
          core: {
            window: "all_time",
            aggregation: {
              tasks_count: coreRes.tasks_count,
              avg_output_length: coreRes.avg_output_length,
              exact_count: coreRes.exact_count,
              sample_size: coreRes.sample_size,
              sampled: coreSampled,
            },
          },
          pulse: {
            window: `last_${pulseDays}_days`,
            sinceISO: since.toISOString(),
            aggregation: {
              tasks_count: pulseRes.tasks_count,
              avg_output_length: pulseRes.avg_output_length,
              exact_count: pulseRes.exact_count,
              sample_size: pulseRes.sample_size,
              sampled: pulseSampled,
            },
          },
          marketing: {
            score_0_to_5: marketingScore,
            impacts_count: marketingImpactsCount,
            weight: MARKETING_WEIGHT,
          },
          experience: {
            capital: experienceCapital,
            normalized_to_core_scale: experienceNormalizedToCoreScale,
            weight: EXPERIENCE_WEIGHT,
          },
          total: {
            weights: {
              core: CORE_WEIGHT,
              pulse: PULSE_WEIGHT,
              operations: OPERATIONS_WEIGHT,
              marketing: MARKETING_WEIGHT,
              experience: EXPERIENCE_WEIGHT,
            },
          },
        },

        score: {
          value: totalScore,
        },
        computedScore: totalScore,
        scoreValue: totalScore,

        score_engine: {
          version: core.version,
          score: core.score,
          confidence: core.confidence,
          components: core.components,
          meta: core.meta,
        },

        score_engine_pulse: {
          version: pulse.version,
          score: pulse.score,
          confidence: pulse.confidence,
          components: pulse.components,
          meta: pulse.meta,
        },

        score_engine_total: {
          version: core.version,
          score: totalScore,
          confidence: totalConfidence,
          meta: {
            maxScore,
            weights: {
              core: CORE_WEIGHT,
              pulse: PULSE_WEIGHT,
              operations: OPERATIONS_WEIGHT,
              marketing: MARKETING_WEIGHT,
              experience: EXPERIENCE_WEIGHT,
            },
            coreScore: core.score,
            pulseScore: pulse.score,
            operationsScore,
            marketingScore0to5: marketingScore,
            marketingNormalizedToCoreScale,
            experienceCapital,
            experienceNormalizedToCoreScale,
          },
        },
      },
      { status: 200 },
    );
  } catch (e: unknown) {
    console.error("/api/internal/agent-score-v1 error:", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}