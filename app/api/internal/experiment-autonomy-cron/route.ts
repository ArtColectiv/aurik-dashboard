import { NextResponse } from "next/server";
import { runExperimentAutonomy } from "@/lib/aurik/autonomy/experimentAutonomy";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const expectedSecret = process.env.AURIK_CRON_SECRET;

    if (!expectedSecret) {
      return NextResponse.json(
        { ok: false, error: "Missing server cron secret configuration" },
        { status: 500 }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { agentName } = body ?? {};

    if (!agentName || typeof agentName !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing agentName" },
        { status: 400 }
      );
    }

    const cleanedAgentName = agentName.trim();
    const result = await runExperimentAutonomy(cleanedAgentName);

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          mode: "cron",
          agentName: cleanedAgentName,
          error: result.error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "cron",
      agentName: cleanedAgentName,
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