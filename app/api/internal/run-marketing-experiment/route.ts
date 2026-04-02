import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { getMarketingExperimentByKey } from "@/lib/aurik/decision/marketingExperimentRegistry";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { agentName, impactId, experimentKey } = body;

    if (!agentName || !impactId || !experimentKey) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const experiment = getMarketingExperimentByKey(experimentKey);

    if (!experiment) {
      return NextResponse.json(
        { ok: false, error: "Unknown experiment key" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("agent_events")
      .insert({
        agent_name: agentName,
        event_type: "marketing_experiment_started",
        payload: {
          impactId,
          experimentKey,
          title: experiment.title,
          description: experiment.description,
          skillPackKey: experiment.skillPackKey,
          actionKey: experiment.actionKey
        }
      })
      .select()
      .limit(1);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      event: data?.[0] ?? null,
      experiment
    });

  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Unhandled error" },
      { status: 500 }
    );
  }
}