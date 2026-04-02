// lib/aurik/learning/marketingLearningEngine.ts

/**
 * Ce module ne parle PAS directement à la DB.
 * Il reçoit des "lignes" déjà chargées (feedback, publications, metrics)
 * et calcule :
 *  - des préférences marketing pour l'agent
 *  - un AurikScore
 *
 * Plus tard, un autre module/server job ira:
 *  - lire Supabase
 *  - passer les données ici
 *  - sauvegarder les résultats dans une table agent_metrics, etc.
 */

export type Platform = "instagram" | "tiktok" | "facebook" | "linkedin";
export type ContentType = "post" | "reel";

export interface MarketingFeedbackRow {
  id: string;
  agent_name: string;
  content_type: ContentType;
  platform: Platform;
  goal_description: string;
  caption: string | null;
  hook: string | null;
  call_to_action: string | null;
  hashtags: string[] | null;
  feedback_type: "accepted" | "modified" | "rejected" | "regenerated" | null;
  model_quality_score: number | null;
  user_rating: number | null;
  created_at: string; // ISO string
}

export interface MarketingPublishedContentRow {
  id: string;
  agent_name: string;
  content_type: ContentType;
  platform: Platform;
  feedback_id: string | null;
  platform_post_id: string;
  platform_post_url: string | null;
  published_at: string | null;
}

export interface MarketingPlatformMetricsRow {
  id: string;
  published_content_id: string;
  platform: Platform;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  impressions: number | null;
  reach: number | null;
  views: number | null;
  avg_watch_time: number | null;
  completion_rate: number | null; // 0.0 - 1.0
  click_through_rate: number | null; // 0.0 - 1.0
  created_at: string; // ISO
}

/**
 * Préférences marketing "apprises" pour un agent.
 * Ce n'est pas magique : ce sont juste des statistiques interprétées.
 */
export interface AgentMarketingPreferences {
  agentName: string;

  // Le style de hook qui semble le mieux performer
  preferredHookStyle: "short_question" | "statement" | "story" | "unknown";

  // Sur les captions : plutôt courtes / moyennes / longues
  captionLengthPreference: "short" | "medium" | "long" | "unknown";

  // Types de contenu les plus performants
  prefersReelsOverPosts: boolean;
  bestPlatforms: Platform[];

  // Hashtags à favoriser / à éviter
  hashtagsToFavor: string[];
  hashtagsToAvoid: string[];

  // CTA qui semblent corrélés a de meilleures métriques
  favoredCtas: string[];
}

/**
 * Score global de l'agent, plus quelques sous-métriques.
 * L'objectif n'est pas d'être scientifiquement parfait,
 * mais d'avoir un baromètre qui monte avec l'expérience et la performance.
 */
export interface AgentAurikScore {
  agentName: string;
  score: number; // 0 à 100000
  details: {
    dataVolume: number; // 0 à 1 (combien d'échantillons ?)
    feedbackAlignment: number; // 0 à 1 (feedback utilisateur)
    platformPerformance: number; // 0 à 1 (likes/engagement relatif)
    consistency: number; // 0 à 1 (résultats stables vs aléatoires)
  };
}

/**
 * Résultat global du learning engine pour un agent.
 */
export interface AgentLearningInsights {
  preferences: AgentMarketingPreferences;
  aurikScore: AgentAurikScore;
}

/**
 * Utilitaire pour compter les occurrences et trier.
 */
function countOccurrences<T>(items: T[]): Map<T, number> {
  const map = new Map<T, number>();
  for (const item of items) {
    map.set(item, (map.get(item) ?? 0) + 1);
  }
  return map;
}

function topNFromCountMap<T>(map: Map<T, number>, n: number): T[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => key);
}

/**
 * Détermine le style de hook de façon très heuristique.
 */
function classifyHookStyle(hook: string): "short_question" | "statement" | "story" {
  const trimmed = hook.trim();
  const length = trimmed.length;

  const isQuestion = trimmed.endsWith("?");
  const hasNarrativeMarkers = /il était une fois|un jour|je me souviens|histoire|once upon a time/i.test(trimmed);

  if (isQuestion && length <= 80) return "short_question";
  if (hasNarrativeMarkers || length > 200) return "story";
  return "statement";
}

/**
 * Détermine la catégorie de longueur de caption.
 */
function classifyCaptionLength(caption: string): "short" | "medium" | "long" {
  const length = caption.trim().length;
  if (length < 120) return "short";
  if (length < 300) return "medium";
  return "long";
}

/**
 * Fonction principale:
 * Prend toutes les lignes pertinentes pour un agent
 * et renvoie ses préférences + son AurikScore.
 */
export function computeAgentMarketingInsights(params: {
  agentName: string;
  feedbackRows: MarketingFeedbackRow[];
  publishedRows: MarketingPublishedContentRow[];
  metricsRows: MarketingPlatformMetricsRow[];
}): AgentLearningInsights {
  const { agentName, feedbackRows, publishedRows, metricsRows } = params;

  // On filtre au cas où on ait des lignes d'autres agents.
  const feedback = feedbackRows.filter((f: MarketingFeedbackRow) => f.agent_name === agentName);
  const published = publishedRows.filter((p: MarketingPublishedContentRow) => p.agent_name === agentName);

  const metricsByPublishedId = new Map<string, MarketingPlatformMetricsRow[]>();
  for (const m of metricsRows) {
    const arr = metricsByPublishedId.get(m.published_content_id) ?? [];
    arr.push(m);
    metricsByPublishedId.set(m.published_content_id, arr);
  }

  // -----------------------
  // 1. Analyse de feedback
  // -----------------------

  const acceptedFeedback = feedback.filter(
    (f: MarketingFeedbackRow) => f.feedback_type === "accepted" || f.feedback_type === "modified"
  );
  const rejectedFeedback = feedback.filter((f: MarketingFeedbackRow) => f.feedback_type === "rejected");

  // Hook styles
  const hookStyles: Array<"short_question" | "statement" | "story"> = [];
  for (const f of acceptedFeedback) {
    if (f.hook && f.hook.trim().length > 0) {
      hookStyles.push(classifyHookStyle(f.hook));
    }
  }
  const hookStyleCounts = countOccurrences(hookStyles);
  const preferredHookStyleRaw = topNFromCountMap(hookStyleCounts, 1)[0];
  const preferredHookStyle: AgentMarketingPreferences["preferredHookStyle"] = preferredHookStyleRaw ?? "unknown";

  // Caption lengths
  const captionLengths: Array<"short" | "medium" | "long"> = [];
  for (const f of acceptedFeedback) {
    if (f.caption && f.caption.trim().length > 0) {
      captionLengths.push(classifyCaptionLength(f.caption));
    }
  }
  const captionLengthCounts = countOccurrences(captionLengths);
  const preferredCaptionLengthRaw = topNFromCountMap(captionLengthCounts, 1)[0];
  const captionLengthPreference: AgentMarketingPreferences["captionLengthPreference"] = preferredCaptionLengthRaw ?? "unknown";

  // Hashtags
  const hashtagCounts = new Map<string, number>();
  const rejectedHashtagCounts = new Map<string, number>();

  for (const f of acceptedFeedback) {
    (f.hashtags ?? []).forEach((tag: string) => {
      const key = tag.trim().toLowerCase();
      if (!key) return;
      hashtagCounts.set(key, (hashtagCounts.get(key) ?? 0) + 1);
    });
  }
  for (const f of rejectedFeedback) {
    (f.hashtags ?? []).forEach((tag: string) => {
      const key = tag.trim().toLowerCase();
      if (!key) return;
      rejectedHashtagCounts.set(key, (rejectedHashtagCounts.get(key) ?? 0) + 1);
    });
  }

  const hashtagsToFavor = topNFromCountMap(hashtagCounts, 10);
  const hashtagsToAvoid = topNFromCountMap(rejectedHashtagCounts, 10);

  // CTA favoris (sur les contenus acceptés)
  const ctaCounts = new Map<string, number>();
  for (const f of acceptedFeedback) {
    if (f.call_to_action) {
      const key = f.call_to_action.trim();
      if (!key) continue;
      ctaCounts.set(key, (ctaCounts.get(key) ?? 0) + 1);
    }
  }
  const favoredCtas = topNFromCountMap(ctaCounts, 5);

  // Post vs reel preference (par feedback)
  const postAcceptedCount = acceptedFeedback.filter((f: MarketingFeedbackRow) => f.content_type === "post").length;
  const reelAcceptedCount = acceptedFeedback.filter((f: MarketingFeedbackRow) => f.content_type === "reel").length;
  const prefersReelsOverPosts = reelAcceptedCount > postAcceptedCount;

  // Best platforms: engagement basé sur metrics quand dispo
  const engagementScoresByPlatform = new Map<Platform, number[]>();

  for (const pub of published) {
    const mArr = metricsByPublishedId.get(pub.id) ?? [];
    for (const m of mArr) {
      const likes = m.likes ?? 0;
      const comments = m.comments ?? 0;
      const shares = m.shares ?? 0;
      const saves = m.saves ?? 0;
      const impressions = m.impressions ?? m.reach ?? 0;

      let score = likes + 2 * comments + 3 * shares + 2 * saves;
      if (impressions > 0) score = score / Math.sqrt(impressions);

      const arr = engagementScoresByPlatform.get(m.platform) ?? [];
      arr.push(score);
      engagementScoresByPlatform.set(m.platform, arr);
    }
  }

  const avgEngagementByPlatform = new Map<Platform, number>();
  for (const [platform, arr] of Array.from(engagementScoresByPlatform.entries())) {
    if (arr.length === 0) continue;
    const avg = arr.reduce((a: number, b: number) => a + b, 0) / arr.length;
    avgEngagementByPlatform.set(platform, avg);
  }

  const bestPlatforms = Array.from(avgEngagementByPlatform.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([platform]) => platform);

  // -----------------------
  // 2. Calcul d'un AurikScore
  // -----------------------

  const totalFeedbackCount = feedback.length;
  const totalMetricsCount = metricsRows.length;

  // saturé à 1 au-delà de 50 échantillons
  const dataVolumeRaw = Math.min(1, (totalFeedbackCount + totalMetricsCount) / 50);

  // feedbackAlignment: ratio accepted / total (en pénalisant reject)
  const acceptedCount = acceptedFeedback.length;
  const rejectedCount = rejectedFeedback.length;

  let feedbackAlignment = 0;
  const denom = acceptedCount + rejectedCount;
  if (denom > 0) {
    feedbackAlignment = Math.max(0, Math.min(1, (acceptedCount - rejectedCount * 0.5) / denom));
  }

  // platformPerformance: moyenne des engagement scores normalisés
  let platformPerformance = 0;
  if (avgEngagementByPlatform.size > 0) {
    const vals = Array.from(avgEngagementByPlatform.values());
    const max = Math.max(...vals);
    if (max > 0) {
      platformPerformance = vals.reduce((a: number, b: number) => a + b, 0) / (vals.length * max);
    }
    platformPerformance = Math.max(0, Math.min(1, platformPerformance));
  }

  // consistency: stabilité des scores (1 - coefficient de variation)
  let consistency = 0;
  const allEngagementSamples: number[] = Array.from(engagementScoresByPlatform.values()).flat();

  if (allEngagementSamples.length > 3) {
    const avg = allEngagementSamples.reduce((a: number, b: number) => a + b, 0) / allEngagementSamples.length;

    const variance =
      allEngagementSamples.reduce((sum: number, v: number) => {
        const diff = v - avg;
        return sum + diff * diff;
      }, 0) / allEngagementSamples.length;

    const std = Math.sqrt(variance);
    if (avg > 0) {
      const cv = std / avg;
      consistency = Math.max(0, Math.min(1, 1 - cv));
    } else {
      consistency = 0;
    }
  }

  const rawComposite = 0.3 * dataVolumeRaw + 0.3 * feedbackAlignment + 0.25 * platformPerformance + 0.15 * consistency;

  // rawComposite ∈ [0,1]
  // au carré pour progression lente
  // puis sur 0 → 100000
  let score = Math.pow(Math.max(0, Math.min(1, rawComposite)), 2) * 100000;
  score = Math.round(score);

  const preferences: AgentMarketingPreferences = {
    agentName,
    preferredHookStyle,
    captionLengthPreference,
    prefersReelsOverPosts,
    bestPlatforms,
    hashtagsToFavor,
    hashtagsToAvoid,
    favoredCtas,
  };

  const aurikScore: AgentAurikScore = {
    agentName,
    score,
    details: {
      dataVolume: dataVolumeRaw,
      feedbackAlignment,
      platformPerformance,
      consistency,
    },
  };

  return {
    preferences,
    aurikScore,
  };
}
