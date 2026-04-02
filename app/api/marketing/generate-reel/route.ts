import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

import { generateMarketingReel } from "@/lib/aurik/skillpacks/marketingSkillPack";

function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[Aurik] generate-reel: missing Supabase env", {
      hasUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
    });
    throw new Error("Supabase configuration missing");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

type MarketingPlatform = string;
type MarketingContentGoal = string;
type MarketingGenerationPreferences = Record<string, unknown>;

interface GenerateReelBody {
  agentName: string;
  platform: MarketingPlatform;
  goalDescription: string;
  goalType?: MarketingContentGoal;
  formatDescription?: string;
}

interface AgentRow {
  id: string;
}

type ImpactCreateResponse = {
  ok?: boolean;
  impact?: {
    id?: string;
    baselineValue?: number | null;
    postValue?: number | null;
  };
};

type ExistingImpactRow = {
  id: string;
  baseline_value: number;
  post_value: number | null;
  status: string | null;
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

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toPositiveNumber(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

function extractSceneCount(scriptSteps: unknown): number {
  if (Array.isArray(scriptSteps)) {
    return Math.max(1, scriptSteps.length);
  }

  if (scriptSteps && typeof scriptSteps === "object") {
    const obj = scriptSteps as Record<string, unknown>;

    if (Array.isArray(obj.steps)) {
      return Math.max(1, obj.steps.length);
    }

    if (Array.isArray(obj.scenes)) {
      return Math.max(1, obj.scenes.length);
    }

    if (obj.reel && typeof obj.reel === "object") {
      const reelObj = obj.reel as Record<string, unknown>;

      if (Array.isArray(reelObj.steps)) {
        return Math.max(1, reelObj.steps.length);
      }

      if (Array.isArray(reelObj.scenes)) {
        return Math.max(1, reelObj.scenes.length);
      }
    }
  }

  return 1;
}

async function upsertAndEvaluateCumulativeImpact(params: {
  req: NextRequest;
  supabase: ReturnType<typeof createSupabaseServerClient>;
  requestId: string;
  agentId: string;
  reelRowId: string;
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
    reelRowId,
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
      console.warn("[Aurik] generate-reel:impact_lookup_failed", {
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
              reelId: reelRowId,
              ...meta,
            },
          }),
        }
      );

      if (!impactRes.ok) {
        const impactText = await impactRes.text();
        console.warn("[Aurik] generate-reel:impact_create_failed", {
          requestId,
          agentId,
          reelRowId,
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
              reelId: reelRowId,
              source: "generate_reel_auto_evaluate",
              delta,
              ...meta,
            },
          }),
        }
      );

      if (!evaluateRes.ok) {
        const evaluateText = await evaluateRes.text();
        console.warn("[Aurik] generate-reel:impact_evaluate_failed", {
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
    console.warn("[Aurik] generate-reel:impact_sync_unexpected_error", {
      requestId,
      agentId,
      reelRowId,
      metric,
      actionType,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return { impactId, nextPostValue };
}

/**
 * POST /api/marketing/generate-reel
 * SCRIPT ONLY: génère un script reel + sauvegarde en DB
 */
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const body = (await req.json()) as Partial<GenerateReelBody>;

    const agentName = safeTrim(body.agentName);
    const platform = safeTrim(body.platform);
    const goalDescription = safeTrim(body.goalDescription);
    const goalType = safeTrim(body.goalType);
    const formatDescription = safeTrim(body.formatDescription);

    console.log("[Aurik] generate-reel:start", {
      requestId,
      agentName: agentName ?? null,
      platform: platform ?? null,
      hasGoalDescription: !!goalDescription,
    });

    if (!agentName || !platform || !goalDescription) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Paramètres requis: 'agentName', 'platform', 'goalDescription'.",
        },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    // 0) resolve agent id from canonical aurik_agents table
    const { data: agentRow, error: agentError } = await supabase
      .from("aurik_agents")
      .select("id")
      .eq("agent_name", agentName)
      .single<AgentRow>();

    if (agentError || !agentRow?.id) {
      console.error("[Aurik] generate-reel:agent_lookup_error", {
        requestId,
        agentName,
        message: agentError?.message ?? "Agent not found",
      });

      return NextResponse.json(
        { ok: false, error: "Agent introuvable." },
        { status: 404 }
      );
    }

    const agentId = agentRow.id;

    // 1) brand profile
    const { data: brandRow, error: brandError } = await supabase
      .from("marketing_brand_profiles")
      .select("profile")
      .eq("agent_name", agentName)
      .maybeSingle();

    if (brandError) {
      console.error("[Aurik] generate-reel:brand_profile_read_error", {
        requestId,
        agentName,
        message: brandError.message,
      });
      return NextResponse.json(
        { ok: false, error: "Erreur lors de la lecture du profil de marque." },
        { status: 500 }
      );
    }

    const brandProfile = (brandRow?.profile ?? {}) as Record<string, unknown>;

    // 2) preferences
    const { data: metricsRow, error: metricsError } = await supabase
      .from("agent_metrics")
      .select("marketing_preferences")
      .eq("agent_name", agentName)
      .maybeSingle();

    if (metricsError) {
      console.error("[Aurik] generate-reel:agent_metrics_read_error", {
        requestId,
        agentName,
        message: metricsError.message,
      });
      // continue sans prefs
    }

    const preferences =
      (metricsRow?.marketing_preferences as MarketingGenerationPreferences | null) ??
      undefined;

    // 3) generate script via skillpack
    const reel = await generateMarketingReel({
      agentName,
      brandProfile,
      platform,
      goalDescription,
      goalType: goalType ?? undefined,
      formatDescription: formatDescription ?? undefined,
      preferences,
    } as never);

    // 4) normalize output
    const reelRecord = reel as Record<string, unknown>;

    const caption =
      typeof reelRecord.caption === "string" ? reelRecord.caption : null;

    const callToAction =
      typeof reelRecord.callToAction === "string"
        ? reelRecord.callToAction
        : typeof reelRecord.call_to_action === "string"
        ? reelRecord.call_to_action
        : null;

    const hashtags = safeStringArray(reelRecord.hashtags);

    const cover =
      typeof reelRecord.cover === "object" && reelRecord.cover !== null
        ? (reelRecord.cover as Record<string, unknown>)
        : null;

    const coverPrompt =
      typeof cover?.prompt === "string"
        ? cover.prompt
        : typeof reelRecord.coverPrompt === "string"
        ? reelRecord.coverPrompt
        : typeof reelRecord.cover_prompt === "string"
        ? reelRecord.cover_prompt
        : null;

    const scriptSteps =
      reelRecord.scriptSteps ??
      reelRecord.scenes ??
      reelRecord.steps ??
      reel;

    const sceneCount = extractSceneCount(scriptSteps);
    const hashtagCount = hashtags.length;
    const hasCaption = caption ? 1 : 0;
    const hasCallToAction = callToAction ? 1 : 0;

    // 5) save reel to DB
    const { data: inserted, error: insertError } = await supabase
      .from("marketing_generated_reels")
      .insert({
        agent_id: agentId,
        agent_name: agentName, // compat temporaire
        prompt_subject: goalDescription,
        platform: String(platform),
        goal_type: goalType ? String(goalType) : null,
        goal_description: goalDescription,
        script_steps: scriptSteps,
        caption,
        call_to_action: callToAction,
        hashtags: hashtags.length ? hashtags : null,
        cover_prompt: coverPrompt,
        status: "script_ready",
        error_message: null,
      })
      .select("id, agent_id")
      .maybeSingle();

    if (insertError) {
      console.error("[Aurik] generate-reel:db_insert_error", {
        requestId,
        agentId,
        agentName,
        message: insertError.message,
      });
    }

    // 6) multi-impact cumulative logic
    const multiImpactResults: Array<{
      metric: string;
      actionType: string;
      impactId: string | null;
      nextPostValue: number | null;
    }> = [];

    if (inserted?.id) {
      const impactPlans: ImpactPlan[] = [
        {
          metric: "reel_generated",
          actionType: "content_creation",
          delta: 1,
          meta: {
            promptSubject: goalDescription,
            platform: String(platform),
            goalType: goalType ?? null,
            incrementType: "cumulative_reel_count",
          },
        },
        {
          metric: "views",
          actionType: "reel_visibility_proxy",
          delta: Math.max(1, sceneCount),
          meta: {
            promptSubject: goalDescription,
            platform: String(platform),
            goalType: goalType ?? null,
            sceneCount,
            incrementType: "scene_depth_proxy",
          },
        },
        {
          metric: "clicks",
          actionType: "cta_strength_proxy",
          delta: Math.max(1, hasCallToAction + hasCaption),
          meta: {
            promptSubject: goalDescription,
            platform: String(platform),
            goalType: goalType ?? null,
            hasCaption: Boolean(caption),
            hasCallToAction: Boolean(callToAction),
            incrementType: "cta_proxy",
          },
        },
        {
          metric: "followers",
          actionType: "audience_growth_proxy",
          delta: Math.max(1, Math.min(3, hashtagCount > 0 ? hashtagCount : 1)),
          meta: {
            promptSubject: goalDescription,
            platform: String(platform),
            goalType: goalType ?? null,
            hashtagCount,
            incrementType: "hashtag_growth_proxy",
          },
        },
      ];

      for (const plan of impactPlans) {
        const result = await upsertAndEvaluateCumulativeImpact({
          req,
          supabase,
          requestId,
          agentId,
          reelRowId: inserted.id,
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
    }

    // 7) boost experience capital (+1 per generated reel script)
    let nextExperienceCapital: number | null = null;

    try {
      const { data: experienceRow, error: experienceReadError } = await supabase
        .from("aurik_agents")
        .select("aurik_experience_capital")
        .eq("id", agentId)
        .maybeSingle<AgentExperienceRow>();

      if (experienceReadError) {
        console.warn("[Aurik] generate-reel:experience_read_failed", {
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
          console.warn("[Aurik] generate-reel:experience_update_failed", {
            requestId,
            agentId,
            nextExperienceCapital,
            message: experienceUpdateError.message,
          });
        }
      }
    } catch (experienceErr) {
      console.warn("[Aurik] generate-reel:experience_update_unexpected_error", {
        requestId,
        agentId,
        message:
          experienceErr instanceof Error ? experienceErr.message : String(experienceErr),
      });
    }

    const ms = Date.now() - startedAt;

    console.log("[Aurik] generate-reel:success", {
      requestId,
      agentId,
      agentName,
      ms,
      preferencesApplied: !!preferences,
      reelRowId: inserted?.id ?? null,
      multiImpactResults,
      nextExperienceCapital,
    });

    return NextResponse.json(
      {
        ok: true,
        agentId,
        agentName,
        reelRowId: inserted?.id ?? null,
        reel,
        preferencesApplied: !!preferences,
        multiImpactResults,
        meta: { requestId, ms },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const ms = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);

    console.error("[Aurik] generate-reel:unexpected_error", {
      requestId,
      ms,
      message,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Erreur inattendue dans /api/marketing/generate-reel.",
        meta: { requestId, ms },
      },
      { status: 500 }
    );
  }
}