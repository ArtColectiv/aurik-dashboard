import { NextResponse } from "next/server";
import { getExperimentAutonomyStatus } from "@/lib/aurik/autonomy/experimentAutonomy";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agentName } = body;

    if (!agentName || typeof agentName !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing agentName" },
        { status: 400 }
      );
    }

    const result = await getExperimentAutonomyStatus(agentName);

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      agentName: agentName.trim(),
      action: result.action,
      decision: result.decision,
      riskLevel: result.riskLevel,
      reason: result.reason,
      experimentKey: result.experimentKey ?? null,
      impactId: result.impactId ?? null,
      result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unhandled error",
      },
      { status: 500 }
    );
  }
}