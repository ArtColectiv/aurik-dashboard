import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { computeMarketingExperimentOutcome } from "@/lib/aurik/learning/marketingExperimentOutcome";

type ImpactMeasurementRow = {
  measured_value: number;
  measured_at: string;
};

type ExperimentStartEventRow = {
  agent_name: string;
  payload: {
    impactId?: string;
    experimentKey?: string;
  } | null;
  created_at: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { impactId } = body;

    if (!impactId) {
      return NextResponse.json(
        { ok: false, error: "Missing impactId" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    // 1) Load measurements for this impact
    const { data: measurementData, error: measurementError } = await supabase
      .from("impact_measurements")
      .select("measured_value, measured_at")
      .eq("impact_id", impactId)
      .order("measured_at", { ascending: true });

    if (measurementError) {
      return NextResponse.json(
        { ok: false, error: measurementError.message },
        { status: 500 }
      );
    }

    const points = (measurementData ?? []) as ImpactMeasurementRow[];

    if (points.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Not enough measurements" },
        { status: 400 }
      );
    }

    const beforeValue = Number(points[0].measured_value);
    const afterValue = Number(points[points.length - 1].measured_value);

    const outcome = computeMarketingExperimentOutcome(beforeValue, afterValue);

    // 2) Find latest matching experiment_started event for this impact
    const { data: eventData, error: eventError } = await supabase
      .from("agent_events")
      .select("agent_name, payload, created_at")
      .eq("event_type", "marketing_experiment_started")
      .order("created_at", { ascending: false })
      .limit(50);

    if (eventError) {
      return NextResponse.json(
        { ok: false, error: eventError.message },
        { status: 500 }
      );
    }

    const events = (eventData ?? []) as ExperimentStartEventRow[];

    const matchingEvent =
      events.find((eventRow) => eventRow.payload?.impactId === impactId) ?? null;

    if (!matchingEvent) {
      return NextResponse.json(
        {
          ok: false,
          error: "No matching marketing_experiment_started event found for impactId",
        },
        { status: 404 }
      );
    }

    const agentName = matchingEvent.agent_name;
    const experimentKey = matchingEvent.payload?.experimentKey;

    if (!experimentKey) {
      return NextResponse.json(
        { ok: false, error: "Experiment key missing in event payload" },
        { status: 500 }
      );
    }

    // 3) Persist experiment outcome
    const { data: insertData, error: insertError } = await supabase
      .from("agent_experiment_outcomes")
      .insert({
        agent_name: agentName,
        impact_id: impactId,
        experiment_key: experimentKey,
        before_value: outcome.beforeValue,
        after_value: outcome.afterValue,
        delta: outcome.delta,
        delta_pct: outcome.deltaPct,
        outcome: outcome.outcome,
      })
      .select()
      .limit(1);

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      impactId,
      agentName,
      experimentKey,
      measurementsCount: points.length,
      outcome,
      storedOutcome: insertData?.[0] ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Unhandled error" },
      { status: 500 }
    );
  }
}