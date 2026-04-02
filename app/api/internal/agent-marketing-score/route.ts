// app/api/internal/agent-marketing-score/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";

type ImpactTableRow = {
  id: string;
  metric: string;
  action_type: string;
  baseline_value: number;
  post_value: number | null;
  status: string | null;
  created_at: string;
};

type TrajectorySummaryResponse = {
  ok: boolean;
  window?: { n: number; minValue: number | null; maxValue: number | null };
  score?: {
    baseline: number;
    current: number;
    growth: number;
    momentum: number;
    stability: number;
    compositeScore: number;
  };
  points?: Array<{
    measured_at: string;
    measured_value: number;
    source?: string | null;
    meta?: Record<string, unknown> | null;
  }>;
  error?: string;
};

type ImpactSummary = {
  impactId: string;
  metric: string;
  actionType: string;
  weight: number;
  status: string | null;
  baselineValue: number;
  postValue: number | null;
  trajectoryOk: boolean;
  window: TrajectorySummaryResponse["window"] | null;
  score: TrajectorySummaryResponse["score"] | null;
  pointsCount: number;
  error: string | null;
};

function weightForMetric(metric: string): number {
  const m = (metric || "").toLowerCase().trim();
  if (["revenue", "sales", "profit"].includes(m)) return 3;
  if (["leads", "bookings", "appointments", "calls"].includes(m)) return 2;
  if (["followers", "reach", "impressions", "views", "clicks"].includes(m)) return 1;
  return 1;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    const nRaw = searchParams.get("n");
    const n = Math.max(1, Math.min(50, Number(nRaw ?? "10") || 10));

    if (!agentId) {
      return NextResponse.json({ ok: false, error: "Missing agentId" }, { status: 400 });
    }

    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("agent_marketing_impact")
      .select("id, metric, action_type, baseline_value, post_value, status, created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "DB error reading agent_marketing_impact", message: error.message },
        { status: 500 }
      );
    }

    const impacts = (data ?? []) as ImpactTableRow[];

    if (impacts.length === 0) {
      return NextResponse.json({ ok: true, agentId, n, marketingScore: 0, impacts: [] }, { status: 200 });
    }

    const origin = new URL(req.url).origin;

    const impactSummaries: ImpactSummary[] = await Promise.all(
      impacts.map(async (imp: ImpactTableRow): Promise<ImpactSummary> => {
        const impactId = imp.id;
        const metric = imp.metric ?? "";
        const actionType = imp.action_type ?? "";
        const weight = weightForMetric(metric);

        const url = `${origin}/api/internal/trajectory-summary?impactId=${encodeURIComponent(
          impactId
        )}&n=${encodeURIComponent(String(n))}`;

        const res = await fetch(url, { method: "GET" });
        const json = (await res.json()) as TrajectorySummaryResponse;

        const pointsCount = Array.isArray(json.points) ? json.points.length : 0;

        return {
          impactId,
          metric,
          actionType,
          weight,
          status: imp.status ?? null,
          baselineValue: Number(imp.baseline_value ?? 0),
          postValue: imp.post_value === null ? null : Number(imp.post_value),
          trajectoryOk: Boolean(json.ok),
          window: json.window ?? null,
          score: json.score ?? null,
          pointsCount,
          error: json.ok ? null : (json.error ?? "trajectory-summary failed"),
        };
      })
    );

    const scored = impactSummaries.filter(
      (x: ImpactSummary) => x.pointsCount > 0 && typeof x.score?.compositeScore === "number"
    );

    const numerator = scored.reduce((acc: number, x: ImpactSummary) => acc + x.weight * (x.score!.compositeScore), 0);
    const denom = scored.reduce((acc: number, x: ImpactSummary) => acc + x.weight, 0);

    const marketingScoreRaw = denom > 0 ? numerator / denom : 0;
    const marketingScore = Math.max(0, Math.min(5, marketingScoreRaw));

    return NextResponse.json(
      {
        ok: true,
        agentId,
        n,
        marketingScore,
        impacts: impactSummaries,
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: "Unhandled error", message }, { status: 500 });
  }
}