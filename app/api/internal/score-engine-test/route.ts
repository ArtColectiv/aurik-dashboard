// app/api/internal/score-engine-test/route.ts
import { NextResponse } from "next/server";
import { computeScoreFromAgentMetrics } from "@/lib/aurik/score/scoreAdapterV1";

export async function GET() {
  const result = computeScoreFromAgentMetrics({
    tasks_count: 42,
    avg_output_length: 900,
  });

  return NextResponse.json(
    {
      ok: true,
      adapter: "v1",
      result,
    },
    { status: 200 },
  );
}