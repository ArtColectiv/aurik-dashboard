const GRAPH_API_BASE = "https://graph.facebook.com/v23.0";

type MediaInsightsResult = {
  likeCount: number;
  commentsCount: number;
  engagementScore: number;
};

export async function fetchInstagramMediaInsights(params: {
  igMediaId: string;
  accessToken: string;
}): Promise<MediaInsightsResult> {
  const url = new URL(`${GRAPH_API_BASE}/${params.igMediaId}`);
  url.searchParams.set("fields", "like_count,comments_count");
  url.searchParams.set("access_token", params.accessToken);

  const res = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as
    | {
        like_count?: number;
        comments_count?: number;
        error?: { message?: string };
      }
    | null;

  if (!res.ok || !json) {
    throw new Error(json?.error?.message ?? `Instagram media fetch failed (${res.status})`);
  }

  const likeCount = Number(json.like_count ?? 0);
  const commentsCount = Number(json.comments_count ?? 0);

  // formule simple V1
  let rawScore = (likeCount * 0.02) + (commentsCount * 0.08);

// plancher minimum pour éviter de tuer les créneaux trop vite
const engagementScore = Math.max(0.3, Math.min(1, rawScore));

  return {
    likeCount,
    commentsCount,
    engagementScore,
  };
}