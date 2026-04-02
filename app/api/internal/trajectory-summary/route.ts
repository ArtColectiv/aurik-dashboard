import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { computeTrajectoryScore } from "@/lib/aurik/score/trajectoryScore";

type MeasurementRow = {
  measured_at: string;
  measured_value: number;
  source: string;
  meta: Record<string, unknown>;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const impactId = searchParams.get("impactId");

    // optional: ?n=10
    const nRaw = searchParams.get("n");
    const n = Math.max(1, Math.min(50, Number(nRaw ?? 10) || 10));

    if (!impactId) {
      return NextResponse.json(
        { ok: false, error: "Missing impactId" },
        { status: 400 }
      );
    }

    // 1) Score hybride (baseline/current/growth/momentum/stability/compositeScore)
    const score = await computeTrajectoryScore(impactId, Math.min(10, n)); // score window <= 10 pour rester stable MVP

    if (!score) {
      return NextResponse.json(
        { ok: false, error: "No measurements found" },
        { status: 404 }
      );
    }

    // 2) Points (N derniers)
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("impact_measurements")
      .select("measured_at, measured_value, source, meta")
      .eq("impact_id", impactId)
      .order("measured_at", { ascending: false })
      .limit(n);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const points: MeasurementRow[] = (data ?? []).map((row: any) => ({
      measured_at: row.measured_at,
      measured_value: Number(row.measured_value),
      source: String(row.source ?? ""),
      meta: (row.meta ?? {}) as Record<string, unknown>,
    }));

    // min/max pour l'UI
    const values = points.map((p) => p.measured_value).filter((v) => Number.isFinite(v));
    const minValue = values.length ? Math.min(...values) : null;
    const maxValue = values.length ? Math.max(...values) : null;

    return NextResponse.json({
      ok: true,
      impactId,
      window: {
        n,
        minValue,
        maxValue,
      },
      score,
      points,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}