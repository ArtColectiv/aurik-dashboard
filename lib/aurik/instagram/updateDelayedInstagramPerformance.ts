import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { fetchInstagramMediaInsights } from "@/lib/aurik/instagram/fetchInstagramMediaInsights";

type PerformanceRow = {
  id: string;
  agent_id: string;
  post_id: string | null;
  day_of_week: number | null;
  hour_utc: number | null;
  engagement_score: number | null;
  created_at: string;
};

export async function updateDelayedInstagramPerformance(params: {
  accessToken: string;
  minAgeMinutes?: number;
}) {
  const supabase = supabaseServer();
  const minAgeMinutes = params.minAgeMinutes ?? 15;

  const cutoff = new Date(Date.now() - minAgeMinutes * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from("agent_posting_performance")
    .select("id,agent_id,post_id,day_of_week,hour_utc,engagement_score,created_at")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<PerformanceRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const candidates = (rows ?? []).filter(
    (row) => row.post_id && (row.engagement_score === 0 || row.engagement_score === 0.5)
  );

  const results: Array<{
    performanceId: string;
    postId: string;
    updated: boolean;
    engagementScore: number | null;
    error: string | null;
  }> = [];

  for (const row of candidates) {
    try {
      const insights = await fetchInstagramMediaInsights({
        igMediaId: row.post_id as string,
        accessToken: params.accessToken,
      });

      await supabase
        .from("agent_posting_performance")
        .update({
          engagement_score: insights.engagementScore,
        })
        .eq("id", row.id);

      if (
        row.day_of_week !== null &&
        row.hour_utc !== null
      ) {
        await supabase.rpc("update_posting_window_score", {
          p_agent_id: row.agent_id,
          p_day_of_week: row.day_of_week,
          p_hour_utc: row.hour_utc,
          p_engagement_score: insights.engagementScore,
        });
      }

      results.push({
        performanceId: row.id,
        postId: row.post_id as string,
        updated: true,
        engagementScore: insights.engagementScore,
        error: null,
      });
    } catch (err) {
      results.push({
        performanceId: row.id,
        postId: row.post_id as string,
        updated: false,
        engagementScore: null,
        error: err instanceof Error ? err.message : "Unknown delayed insights error",
      });
    }
  }

  return {
    checked: (rows ?? []).length,
    candidates: candidates.length,
    updated: results.filter((r) => r.updated).length,
    results,
  };
}