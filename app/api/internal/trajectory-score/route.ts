import { NextResponse } from "next/server";
import { computeTrajectoryScore } from "@/lib/aurik/score/trajectoryScore";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const impactId = searchParams.get("impactId");

    if (!impactId) {
      return NextResponse.json(
        { ok: false, error: "Missing impactId" },
        { status: 400 }
      );
    }

    const result = await computeTrajectoryScore(impactId);

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "No measurements found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      ...result,
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