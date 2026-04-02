import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

import { generateLeadAction } from "@/lib/aurik/skillpacks/leadGenerationSkillPack";

function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[Aurik] lead-generation: missing Supabase env", {
      hasUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
    });
    throw new Error("Supabase configuration missing");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

type RunLeadGenerationBody = {
  agentName?: string;
  goalDescription?: string;
  targetAudience?: string;
};

type AgentRow = {
  id: string;
};

type ExistingImpactRow = {
  id: string;
  baseline_value: number;
  post_value: number | null;
  status: string | null;
};

type ImpactCreateResponse = {
  ok?: boolean;
  impact?: {
    id?: string;
    baselineValue?: number | null;
    postValue?: number | null;
  };
};

type AgentExperienceRow = {
  aurik_experience_capital: number | null;
};

type ImpactPlan = {
  metric: string;
  actionType: string;
  delta: number;
  meta: Record<string, unknown>;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function safeTrim(v: unknown): string | undefined {
  if (!isNonEmptyString(v)) return undefined;
  return v.trim();
}

function toPositiveNumber(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

async function upsertAndEvaluateCumulativeImpact(params: {
  req: NextRequest;
  supabase: ReturnType<typeof createSupabaseServerClient>;
  requestId: string;
  agentId: string;
  anchorId: string;
  metric: string;
  actionType: string;
  delta: number;
  meta: Record<string, unknown>;
}) {
  const {
    req,
    supabase,
    requestId,
    agentId,
    anchorId,
    metric,
    actionType,
    delta,
    meta,
  } = params;

  if (!Number.isFinite(delta) || delta <= 0) {
    return { impactId: null as string | null, nextPostValue: null as number | null };
  }

  let impactId: string | null = null;
  let nextPostValue: number | null = null;

  try {
    const { data: existingImpact, error: existingImpactError } = await supabase
      .from("agent_marketing_impact")
      .select("id, baseline_value, post_value, status")
      .eq("agent_id", agentId)
      .eq("metric", metric)
      .eq("action_type", actionType)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ExistingImpactRow>();

    if (existingImpactError) {
      console.warn("[Aurik] lead-generation:impact_lookup_failed", {
        requestId,
        agentId,
        metric,
        actionType,
        message: existingImpactError.message,
      });
    }

    if (existingImpact?.id) {
      impactId = existingImpact.id;

      const baselineValue = toPositiveNumber(existingImpact.baseline_value, 1);
      const currentPostValue = toPositiveNumber(
        existingImpact.post_value,
        baselineValue
      );

      nextPostValue = currentPostValue + delta;
    } else {
      const impactRes = await fetch(
        new URL("/api/internal/agent-marketing-impact-create", req.url).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            metric,
            actionType,
            baselineValue: 1,
            status: "active",
            meta: {
              anchorId,
              ...meta,
            },
          }),
        }
      );

      if (!impactRes.ok) {
        const impactText = await impactRes.text();
        console.warn("[Aurik] lead-generation:impact_create_failed", {
          requestId,
          agentId,
          anchorId,
          metric,
          actionType,
          status: impactRes.status,
          body: impactText,
        });
        return { impactId: null, nextPostValue: null };
      }

      const impactJson = (await impactRes.json()) as ImpactCreateResponse;
      impactId = impactJson.impact?.id ?? null;

      const baselineValue = toPositiveNumber(
        impactJson.impact?.baselineValue,
        1
      );
      const currentPostValue = toPositiveNumber(
        impactJson.impact?.postValue,
        baselineValue
      );

      nextPostValue = currentPostValue + delta;
    }

    if (impactId && nextPostValue !== null) {
      const evaluateRes = await fetch(
        new URL("/api/internal/impact-evaluate", req.url).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            impactId,
            postValue: nextPostValue,
            metaPatch: {
              anchorId,
              source: "lead_generation_auto_evaluate",
              delta,
              ...meta,
            },
          }),
        }
      );

      if (!evaluateRes.ok) {
        const evaluateText = await evaluateRes.text();
        console.warn("[Aurik] lead-generation:impact_evaluate_failed", {
          requestId,
          impactId,
          metric,
          actionType,
          nextPostValue,
          status: evaluateRes.status,
          body: evaluateText,
        });
      }
    }
  } catch (err) {
    console.warn("[Aurik] lead-generation:impact_sync_unexpected_error", {
      requestId,
      agentId,
      anchorId,
      metric,
      actionType,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return { impactId, nextPostValue };
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const body = (await req.json()) as RunLeadGenerationBody;

    const agentName = safeTrim(body.agentName);
    const goalDescription = safeTrim(body.goalDescription);
    const targetAudience = safeTrim(body.targetAudience);

    if (!agentName || !goalDescription) {
      return NextResponse.json(
        {
          ok: false,
          error: "Paramètres requis: 'agentName', 'goalDescription'.",
        },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    const { data: agentRow, error: agentError } = await supabase
      .from("aurik_agents")
      .select("id")
      .eq("agent_name", agentName)
      .single<AgentRow>();

    if (agentError || !agentRow?.id) {
      return NextResponse.json(
        { ok: false, error: "Agent introuvable." },
        { status: 404 }
      );
    }

    const agentId = agentRow.id;

    const { data: brandRow, error: brandError } = await supabase
      .from("marketing_brand_profiles")
      .select("profile")
      .eq("agent_name", agentName)
      .maybeSingle();

    if (brandError) {
      return NextResponse.json(
        { ok: false, error: "Erreur lors de la lecture du profil de marque." },
        { status: 500 }
      );
    }

    const brandProfile = (brandRow?.profile ?? {}) as Record<string, unknown>;

    const { data: metricsRow, error: metricsError } = await supabase
      .from("agent_metrics")
      .select("marketing_preferences")
      .eq("agent_name", agentName)
      .maybeSingle();

    if (metricsError) {
      console.warn("[Aurik] lead-generation:agent_metrics_read_error", {
        requestId,
        agentName,
        message: metricsError.message,
      });
    }

    const preferences =
      (metricsRow?.marketing_preferences as Record<string, unknown> | null) ??
      undefined;

    const leadAction = await generateLeadAction({
      agentName,
      brandProfile,
      goalDescription,
      targetAudience,
      preferences,
    });

    const expectedConversionLift =
      typeof leadAction.expectedConversionLift === "number" &&
      Number.isFinite(leadAction.expectedConversionLift)
        ? Math.max(0.01, leadAction.expectedConversionLift)
        : 0.05;

    const anchorId = crypto.randomUUID();

    const leadDelta = 1;
    const clicksDelta = Math.max(1, Math.round(expectedConversionLift * 20));
    const conversionRateDelta = Math.max(
      1,
      Math.round(expectedConversionLift * 100)
    );
    const appointmentsDelta =
      expectedConversionLift >= 0.1 ? 2 : 1;

    const impactPlans: ImpactPlan[] = [
      {
        metric: "leads",
        actionType: "lead_generation",
        delta: leadDelta,
        meta: {
          goalDescription,
          targetAudience: targetAudience ?? null,
          channel: leadAction.channel,
          hook: leadAction.hook,
          callToAction: leadAction.callToAction,
          expectedConversionLift,
        },
      },
      {
        metric: "clicks",
        actionType: "lead_generation_click_proxy",
        delta: clicksDelta,
        meta: {
          goalDescription,
          targetAudience: targetAudience ?? null,
          channel: leadAction.channel,
          expectedConversionLift,
          incrementType: "click_proxy",
        },
      },
      {
        metric: "conversion_rate",
        actionType: "lead_generation_conversion_proxy",
        delta: conversionRateDelta,
        meta: {
          goalDescription,
          targetAudience: targetAudience ?? null,
          channel: leadAction.channel,
          expectedConversionLift,
          incrementType: "conversion_proxy_pct_points",
        },
      },
      {
        metric: "appointments",
        actionType: "lead_generation_appointment_proxy",
        delta: appointmentsDelta,
        meta: {
          goalDescription,
          targetAudience: targetAudience ?? null,
          channel: leadAction.channel,
          expectedConversionLift,
          incrementType: "appointment_proxy",
        },
      },
    ];

    const multiImpactResults: Array<{
      metric: string;
      actionType: string;
      impactId: string | null;
      nextPostValue: number | null;
    }> = [];

    for (const plan of impactPlans) {
      const result = await upsertAndEvaluateCumulativeImpact({
        req,
        supabase,
        requestId,
        agentId,
        anchorId,
        metric: plan.metric,
        actionType: plan.actionType,
        delta: plan.delta,
        meta: plan.meta,
      });

      multiImpactResults.push({
        metric: plan.metric,
        actionType: plan.actionType,
        impactId: result.impactId,
        nextPostValue: result.nextPostValue,
      });
    }

    let nextExperienceCapital: number | null = null;

    try {
      const { data: experienceRow, error: experienceReadError } = await supabase
        .from("aurik_agents")
        .select("aurik_experience_capital")
        .eq("id", agentId)
        .maybeSingle<AgentExperienceRow>();

      if (experienceReadError) {
        console.warn("[Aurik] lead-generation:experience_read_failed", {
          requestId,
          agentId,
          message: experienceReadError.message,
        });
      } else {
        const currentExperience =
          typeof experienceRow?.aurik_experience_capital === "number" &&
          Number.isFinite(experienceRow.aurik_experience_capital)
            ? experienceRow.aurik_experience_capital
            : 0;

        nextExperienceCapital = currentExperience + 1;

        const { error: experienceUpdateError } = await supabase
          .from("aurik_agents")
          .update({
            aurik_experience_capital: nextExperienceCapital,
          })
          .eq("id", agentId);

        if (experienceUpdateError) {
          console.warn("[Aurik] lead-generation:experience_update_failed", {
            requestId,
            agentId,
            nextExperienceCapital,
            message: experienceUpdateError.message,
          });
        }
      }
    } catch (experienceErr) {
      console.warn("[Aurik] lead-generation:experience_update_unexpected_error", {
        requestId,
        agentId,
        message:
          experienceErr instanceof Error ? experienceErr.message : String(experienceErr),
      });
    }

    const ms = Date.now() - startedAt;

    console.log("[Aurik] lead-generation:success", {
      requestId,
      agentId,
      agentName,
      ms,
      anchorId,
      multiImpactResults,
      nextExperienceCapital,
    });

    return NextResponse.json(
      {
        ok: true,
        agentId,
        agentName,
        anchorId,
        leadAction,
        multiImpactResults,
        nextExperienceCapital,
        meta: { requestId, ms },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const ms = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);

    console.error("[Aurik] lead-generation:unexpected_error", {
      requestId,
      ms,
      message,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Erreur inattendue dans /api/skillpacks/lead-generation/run.",
        meta: { requestId, ms },
      },
      { status: 500 }
    );
  }
}