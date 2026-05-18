import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { computeScoreFromAgentMetrics } from "@/lib/aurik/score/scoreAdapterV1";
import { evaluateActionPolicy } from "@/lib/aurik/actions/policyEngine";
import { createMarketingBaseline } from "@/lib/aurik/impact/marketingImpactService";
import { generateAndStoreImage } from "@/lib/aurik/media/generateAndStoreImage";
import { getPostingWindowDecision } from "@/lib/aurik/posting/getPostingWindowDecision";
import { fetchInstagramMediaInsights } from "@/lib/aurik/instagram/fetchInstagramMediaInsights";
import { updateDelayedInstagramPerformance } from "@/lib/aurik/instagram/updateDelayedInstagramPerformance";

async function pickCopyVariants(agentId: string) {
  const supabase = supabaseServer();

  const { data } = await supabase
    .from("agent_copy_variants")
    .select("id, variant_type, variant_text, performance_score")
    .eq("agent_id", agentId)
    .eq("is_active", true);

  const hooks = (data ?? []).filter((v) => v.variant_type === "hook");
  const ctas = (data ?? []).filter((v) => v.variant_type === "cta");

  function weightedPick(list: any[]) {
    if (!list.length) return null;

    const total = list.reduce((s, v) => s + v.performance_score, 0);
    let rand = Math.random() * total;

    for (const v of list) {
      rand -= v.performance_score;
      if (rand <= 0) return v;
    }

    return list[0];
  }

  const hook = weightedPick(hooks);
  const cta = weightedPick(ctas);

  return {
    hookText: hook?.variant_text ?? "Your next trip just got smarter.",
    ctaText: cta?.variant_text ?? "Shop now.",
    hookId: hook?.id ?? null,
    ctaId: cta?.id ?? null,
  };
}
const QuerySchema = z.object({
  agentId: z.string().uuid(),
  task: z.string().min(1).optional(),
  maxPerDay: z.coerce.number().int().min(1).max(10).optional(),
  maturityEventType: z
    .enum(["combined", "task_executed_ui", "autonomy_tick"])
    .optional(),
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ECOSYSTEM_ID = "default";

type AgentLevelInfo = {
  scoreTotal: number;
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  maxPerDay: number;
};

type PostingRuleRow = {
  min_hours_between_posts: number;
  max_posts_per_day: number;
  min_window_score: number;
  aggressive_day_score: number;
};

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
  else maxPerDay = 12;

  return {
    scoreTotal: s,
    level,
    maxPerDay,
  };
}

function pickAutonomousTask(
  agentName: string,
  selectedHook: string,
  selectedCta: string,
): string {
  const name = agentName.trim().toLowerCase();

  const variants = [
    [
      "Format: product spotlight",
      "Write a short premium ecommerce caption focused on one standout product benefit.",
      "Open with a strong hook.",
      "Keep it concise and polished.",
      "Do not sound generic.",
    ],
    [
      "Format: problem / solution",
      "Start with a common travel frustration.",
      "Then show how the product solves it simply.",
      "Make it feel practical and conversion-driven.",
      "Do not use the same rhythm as a product spotlight post.",
    ],
    [
      "Format: travel lifestyle",
      "Write like a premium travel brand.",
      "Focus on aspiration, movement, freedom, and smart travel.",
      "The product should feel naturally integrated, not aggressively sold.",
      "Do not start with a pain point.",
    ],
    [
      "Format: security focused",
      "Focus on safety, peace of mind, anti-theft, and traveler confidence.",
      "Make the tone reassuring and credible.",
      "Do not sound fear-based or exaggerated.",
    ],
    [
      "Format: practical travel tip",
      "Teach one useful travel habit or packing tip.",
      "Then connect the product naturally to that habit.",
      "Make it feel helpful first, promotional second.",
    ],
  ];

  const selected =
    variants[Math.floor(Math.random() * variants.length)] ?? variants[0];

  if (name.includes("marketing")) {
    return [
      "You are a premium travel ecommerce copywriter writing for Instagram.",
      "Write exactly one caption.",
      "Maximum 60 words.",
      "No bullet points.",
      "No hashtags.",
      "No emoji overload.",
      "Do not use quotation marks.",
      "Avoid repeating the same structure as previous posts.",
      "Avoid repeating the same action in which the product is used.",
      "Avoid always using other products than the one being promoted.",
      "Vary the opening sentence and rhythm.",
      "Vary the age of the characters.",
      "Vary the locations and settings.",
      "Always show good looking people using the product in aspirational travel contexts.",
      `Required hook: ${selectedHook}`,
      `Required CTA: ${selectedCta}`,
      ...selected,
      "The first sentence must match the hook naturally.",
      "The last sentence must use the CTA naturally.",
    ].join("\n\n");
  }

  if (name.includes("finance")) {
    return [
      "Tu es un agent finance pour une PME.",
      "Donne 5 actions cette semaine pour améliorer cashflow et marge.",
      "Structure: Action / Impact financier / Risque.",
    ].join("\n\n");
  }

  return [
    "Tu es un agent Aurik pour une PME.",
    "Donne 5 actions concrètes aujourd'hui pour réduire les tâches et augmenter les revenus.",
    "Structure la réponse en: Action / Temps estimé / Impact attendu / Risque.",
  ].join("\n\n");
}

async function resolveAgentName(agentId: string): Promise<string | null> {
  const supabase = supabaseServer();

  const { data, error } = await supabase
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

function applyMaturityEventTypeFilter(
  query: any,
  maturityEventType: "combined" | "task_executed_ui" | "autonomy_tick",
) {
  if (maturityEventType === "combined") {
    return query.in("event_type", ["task_executed_ui", "autonomy_tick"]);
  }
  return query.eq("event_type", maturityEventType);
}

async function countTodayAutonomyTicks(agentId: string): Promise<number> {
  const supabase = supabaseServer();

  const { count, error } = await (supabase.from("agent_events") as any)
    .select("id", { count: "exact", head: true })
    .eq("event_type", "autonomy_tick")
    .eq("payload->>agent_id", agentId)
    .gte("created_at", startOfDayUTCISO());

  if (error) {
    throw new Error(error.message);
  }

  return typeof count === "number" ? count : 0;
}

async function computeMaturityScoreTotal(params: {
  agentId: string;
  maturityEventType: "combined" | "task_executed_ui" | "autonomy_tick";
  maxEvents: number;
}): Promise<number> {
  const supabase = supabaseServer();

  let countQ = (supabase.from("agent_events") as any).select("id", {
    count: "exact",
    head: true,
  });
  countQ = applyMaturityEventTypeFilter(countQ, params.maturityEventType);
  countQ = countQ.eq("payload->>agent_id", params.agentId);

  const { count, error: countError } = await countQ;
  if (countError) {
    throw new Error(countError.message);
  }

  const tasksCount = typeof count === "number" ? count : 0;

  const pageSize = 1000;
  const target = Math.min(params.maxEvents, 5000);

  let fetched = 0;
  let sum = 0;
  let seen = 0;

  while (fetched < target) {
    const from = fetched;
    const to = Math.min(fetched + pageSize - 1, target - 1);

    let pageQ = (supabase.from("agent_events") as any).select(
      "payload,created_at",
    );
    pageQ = applyMaturityEventTypeFilter(pageQ, params.maturityEventType);
    pageQ = pageQ.eq("payload->>agent_id", params.agentId);
    pageQ = pageQ.order("created_at", { ascending: false }).range(from, to);

    const { data, error } = await pageQ;
    if (error) {
      throw new Error(error.message);
    }

    const rows: Array<{ payload: unknown }> = Array.isArray(data) ? data : [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const payload = row.payload as { output_length?: unknown } | null;
      const value = payload?.output_length;
      const numeric =
        typeof value === "number" && Number.isFinite(value) ? value : null;

      if (numeric !== null) {
        sum += numeric;
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

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY missing" },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = QuerySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid body",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    let delayedPerformance: unknown = null;

    try {
      const instagramToken = process.env.INSTAGRAM_ACCESS_TOKEN;
      if (instagramToken) {
        delayedPerformance = await updateDelayedInstagramPerformance({
          accessToken: instagramToken,
          minAgeMinutes: 15,
        });
      }
    } catch (err) {
      console.error("DELAYED PERFORMANCE ERROR:", err);
    }

    const { agentId, task, maxPerDay, maturityEventType } = parsed.data;

    const agentName = await resolveAgentName(agentId);
    if (!agentName) {
      return NextResponse.json(
        { ok: false, error: "Agent not found", agentId },
        { status: 404 },
      );
    }

    const todayCount = await countTodayAutonomyTicks(agentId);
    const maturityType = maturityEventType ?? "combined";

    const scoreTotal = await computeMaturityScoreTotal({
      agentId,
      maturityEventType: maturityType,
      maxEvents: 5000,
    });

    const levelInfo = getAgentLevelFromScore(scoreTotal);
    const dailyLimit = maxPerDay ?? levelInfo.maxPerDay;

    const simulatedActionType = "create_social_post";

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

    if (todayCount >= dailyLimit) {
      const supabase = supabaseServer();

      await supabase.from("agent_events").insert([
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
            },
            policy: {
              simulatedActionType,
              decision: policyDecision,
              activeSkillPacks: inferredSkillPacks,
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

const {
  hookText: selectedHook,
  ctaText: selectedCta,
  hookId,
  ctaId,
} = await pickCopyVariants(agentId);

    const autonomousTask =
      task ?? pickAutonomousTask(agentName, selectedHook, selectedCta);

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            `You are the Aurik agent "${agentName}". ` +
            "This is an autonomous work tick. Provide structured, actionable output. " +
            "Avoid fluff. Make it practical for a small business.",
        },
        { role: "user", content: autonomousTask },
      ],
    });

    const result = completion.choices[0]?.message?.content?.trim() ?? "";
    const outputLength = result.length;

    const supabase = supabaseServer();

    const { error: insertError } = await supabase.from("agent_events").insert([
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
          policy: {
            simulatedActionType,
            decision: policyDecision,
            activeSkillPacks: inferredSkillPacks,
          },
          creative: {
            hook: selectedHook,
            cta: selectedCta,
          },
        },
      },
    ]);

    if (insertError) {
      return NextResponse.json(
        {
          ok: false,
          error: "DB error inserting agent_events",
          message: insertError.message,
        },
        { status: 500 },
      );
    }

    if (
      policyDecision === "AUTO_EXECUTE" &&
      inferredSkillPacks.includes("marketing")
    ) {
      const fakeEngagementRate = 5;

      await createMarketingBaseline({
        agentId,
        actionType: simulatedActionType,
        metric: "engagement_rate",
        baselineValue: fakeEngagementRate,
      });
    }

    const socialCaption = result
      .replace(/\*\*/g, "")
      .replace(/^[-•]\s*/gm, "")
      .trim()
      .slice(0, 2200);

    const postingWindow = await getPostingWindowDecision(agentId);

    const { data: rules } = await supabase
      .from("agent_posting_rules")
      .select("min_hours_between_posts,max_posts_per_day,min_window_score,aggressive_day_score")
      .eq("agent_id", agentId)
      .eq("is_active", true)
      .maybeSingle<PostingRuleRow>();

    if (rules) {
      const {
  min_hours_between_posts,
  max_posts_per_day,
  min_window_score,
  aggressive_day_score,
} = rules;

      const { data: lastPost } = await supabase
        .from("agent_posting_performance")
        .select("created_at")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastPost?.created_at) {
        const last = new Date(lastPost.created_at).getTime();
        const now = Date.now();
        const diffHours = (now - last) / (1000 * 60 * 60);

        if (diffHours < min_hours_between_posts) {
          return NextResponse.json({
            ok: true,
            skipped: true,
            reason: "cooldown_active",
            diffHours,
            minRequired: min_hours_between_posts,
          });
        }
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { count: postsTodayCount } = await supabase
        .from("agent_posting_performance")
        .select("*", { count: "exact", head: true })
        .eq("agent_id", agentId)
        .gte("created_at", startOfDay.toISOString());

      if ((postsTodayCount ?? 0) >= max_posts_per_day) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: "daily_limit_reached",
          todayCount: postsTodayCount,
          max_posts_per_day,
        });
      }
    }

    if (rules) {
  const {
    min_hours_between_posts,
    max_posts_per_day,
    min_window_score,
    aggressive_day_score,
  } = rules;

  const windowScore = postingWindow.matchedWindow?.score ?? 0;

  // ❌ trop faible → on skip
  if (windowScore < min_window_score) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "low_window_score",
      windowScore,
      minRequired: min_window_score,
    });
  }

  // 🔥 journée forte → on boost
  const isAggressive = windowScore >= aggressive_day_score;
  const dynamicMaxPosts = isAggressive
    ? max_posts_per_day + 2
    : max_posts_per_day;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count: postsTodayCount } = await supabase
    .from("agent_posting_performance")
    .select("*", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .gte("created_at", startOfDay.toISOString());

  if ((postsTodayCount ?? 0) >= dynamicMaxPosts) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "daily_limit_reached",
      todayCount: postsTodayCount,
      max_posts_per_day: dynamicMaxPosts,
      aggressive: isAggressive,
    });
  }
}

    let generatedMediaUrl: string | null = null;
    let selectedProductSourceId: string | null = null;
    let selectedAngle = "product_spotlight";
    let selectedVisualStyle = "unknown";

    if (
      policyDecision === "AUTO_EXECUTE" &&
      inferredSkillPacks.includes("marketing") &&
      postingWindow.shouldPostNow
    ) {
      try {
        const imageResult = await generateAndStoreImage({
          agentId,
          caption: socialCaption,
        });

        generatedMediaUrl = imageResult.imageUrl;
        selectedProductSourceId = imageResult.productSourceId;
        selectedAngle = imageResult.angle;
        selectedVisualStyle = imageResult.visualStyle;
      } catch (err) {
        console.error("IMAGE GENERATION ERROR:", err);
      }
    }

    const autoPost: {
      attempted: boolean;
      draftCreated: boolean;
      jobCreated: boolean;
      published: boolean;
      draftId: string | null;
      jobId: string | null;
      postId: string | null;
      error: string | null;
    } = {
      attempted: false,
      draftCreated: false,
      jobCreated: false,
      published: false,
      draftId: null,
      jobId: null,
      postId: null,
      error: null,
    };

    if (
      policyDecision === "AUTO_EXECUTE" &&
      inferredSkillPacks.includes("marketing") &&
      postingWindow.shouldPostNow
    ) {
      try {
        const channelConnectionId =
          process.env.AURIK_DEFAULT_CHANNEL_CONNECTION_ID ?? null;
        const postingApiKey = process.env.AURIK_API_KEY ?? null;
        const postingBaseUrl =
          process.env.AURIK_POSTING_BASE_URL ??
          "https://aurik-posting-5m90v1ayn-artcolectivs-projects.vercel.app";

        if (!channelConnectionId || !postingApiKey || !postingBaseUrl) {
          autoPost.attempted = true;
          autoPost.error = "Posting env missing";
        } else {
          autoPost.attempted = true;

          const createRes = await fetch(
            `${postingBaseUrl.replace(/\/$/, "")}/api/drafts/create`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": postingApiKey,
              },
              body: JSON.stringify({
                channelConnectionId,
                caption: socialCaption,
                mediaUrl:
                  generatedMediaUrl ??
                  "https://upload.wikimedia.org/wikipedia/commons/3/3a/Cat03.jpg",
                mediaType: "image",
                platform: "instagram",
                agentName: agentName.trim(),
                agentId,
                agent_id: agentId,
                agent_name: agentName.trim(),
              }),
              cache: "no-store",
            },
          );

          const createJson = (await createRes.json().catch(() => null)) as
            | {
                ok?: boolean;
                error?: string;
                draftId?: string;
                jobId?: string;
              }
            | null;

          if (!createRes.ok || !createJson?.ok) {
            autoPost.error = createJson?.error ?? "Draft/job creation failed";
          } else {
            autoPost.draftCreated = Boolean(createJson.draftId);
            autoPost.jobCreated = Boolean(createJson.jobId);
            autoPost.draftId = createJson.draftId ?? null;
            autoPost.jobId = createJson.jobId ?? null;

            const publishRes = await fetch(
              `${postingBaseUrl.replace(/\/$/, "")}/api/worker/publish`,
              {
                method: "POST",
                cache: "no-store",
              },
            );

            const publishJson = (await publishRes.json().catch(() => null)) as
              | {
                  ok?: boolean;
                  message?: string;
                  results?: Array<{
                    jobId?: string;
                    status?: string;
                    postId?: string;
                    error?: string;
                  }>;
                }
              | null;

            const matchingResult =
              publishJson?.results?.find(
                (item) => item.jobId && item.jobId === autoPost.jobId,
              ) ?? null;

            if (matchingResult?.status === "published") {
              autoPost.published = true;
              autoPost.postId = matchingResult.postId ?? null;

              try {
                const now = new Date();
                const dayOfWeek = now.getUTCDay();
                const hourUtc = now.getUTCHours();

                let engagementScore = 0.5;

                try {
                  const instagramToken = process.env.INSTAGRAM_ACCESS_TOKEN;

                  if (instagramToken && autoPost.postId) {
                    const insights = await fetchInstagramMediaInsights({
                      igMediaId: autoPost.postId,
                      accessToken: instagramToken,
                    });

                    engagementScore = insights.engagementScore;
                  }
                } catch (err) {
                  console.error("INSTAGRAM INSIGHTS ERROR:", err);
                }

                const isWinner = engagementScore >= 0.6;

                // 🔥 Save full creative winner
if (isWinner) {
  const creativeKey = [
    selectedProductSourceId ?? "no_product",
    selectedAngle,
    selectedVisualStyle,
    selectedHook,
    selectedCta,
  ].join("::");

  await supabase.from("agent_creative_winners").insert({
    agent_id: agentId,
    combo_key: creativeKey,
    hook: selectedHook,
    cta: selectedCta,
    performance_score: engagementScore,
  });
}

// 🔹 Hook learning
if (hookId) {
  const { data: existing } = await supabase
    .from("agent_copy_variants")
    .select("performance_score")
    .eq("id", hookId)
    .maybeSingle();

  const oldScore = Number(existing?.performance_score ?? 0.5);
  const newScore = oldScore * 0.7 + engagementScore * 0.3;

  await supabase
    .from("agent_copy_variants")
    .update({ performance_score: newScore })
    .eq("id", hookId);
}

// 🔹 CTA learning
if (ctaId) {
  const { data: existing } = await supabase
    .from("agent_copy_variants")
    .select("performance_score")
    .eq("id", ctaId)
    .maybeSingle();

  const oldScore = Number(existing?.performance_score ?? 0.5);
  const newScore = oldScore * 0.7 + engagementScore * 0.3;

  await supabase
    .from("agent_copy_variants")
    .update({ performance_score: newScore })
    .eq("id", ctaId);
}

                const comboKey = [
                  selectedProductSourceId ?? "no_product",
                  selectedAngle,
                  selectedVisualStyle,
                ].join("::");

                const performanceRow = {
                  agent_id: agentId,
                  post_id: autoPost.postId,
                  day_of_week: dayOfWeek,
                  hour_utc: hourUtc,
                  engagement_score: engagementScore,
                  product_source_id: selectedProductSourceId,
                  content_angle: selectedAngle,
                  visual_style: selectedVisualStyle,
                  is_winner: isWinner,
                  combo_key: comboKey,
                  hook: selectedHook,
                  cta: selectedCta,
                };

                await supabase
                  .from("agent_posting_performance")
                  .insert(performanceRow as any);

                await supabase.rpc("update_posting_window_score", {
                  p_agent_id: agentId,
                  p_day_of_week: dayOfWeek,
                  p_hour_utc: hourUtc,
                  p_engagement_score: engagementScore,
                });

                if (selectedProductSourceId) {
                  const { data: existing } = await supabase
                    .from("agent_product_sources")
                    .select("performance_score")
                    .eq("id", selectedProductSourceId)
                    .maybeSingle();

                  const oldScore = Number(existing?.performance_score ?? 0.5);
                  const newScore = oldScore * 0.7 + engagementScore * 0.3;

                  await supabase
                    .from("agent_product_sources")
                    .update({
                      performance_score: newScore,
                    })
                    .eq("id", selectedProductSourceId);
                }
              } catch (err) {
                console.error("PERFORMANCE TRACK ERROR:", err);
              }
            } else {
              autoPost.error =
                matchingResult?.error ??
                publishJson?.message ??
                "Worker returned no published result";
              console.error("AUTO POST WORKER RESULT ERROR:", autoPost.error);
            }
          }
        }
      } catch (err) {
        autoPost.error =
          err instanceof Error ? err.message : "Unknown auto-post error";
        console.error("AUTO POST ERROR:", err);
      }
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
        postingWindow,
        delayedPerformance,
        autoPost,
      },
      { status: 200 },
    );
  } catch (e) {
    console.error("/api/internal/autonomy-tick error:", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}