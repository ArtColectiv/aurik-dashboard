import { supabaseServer } from "@/lib/aurik/supabaseServer";

type PostingWindowRow = {
  day_of_week: number;
  hour_utc: number;
  score: number;
  is_active: boolean;
};

export async function getPostingWindowDecision(agentId: string) {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("agent_posting_windows")
    .select("day_of_week,hour_utc,score,is_active")
    .eq("agent_id", agentId)
    .eq("is_active", true)
    .returns<PostingWindowRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const hourUtc = now.getUTCHours();

  const match = (data ?? []).find(
    (row) => row.day_of_week === dayOfWeek && row.hour_utc === hourUtc
  );

  return {
    shouldPostNow: Boolean(match && match.score >= 0.6),
    matchedWindow: match ?? null,
    dayOfWeek,
    hourUtc,
  };
}