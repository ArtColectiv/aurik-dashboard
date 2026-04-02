import { supabaseServer } from "../supabaseServer";

export type ImpactTable = "agent_impact" | "agent_marketing_impact";

export interface EvaluateImpactInput {
  impactId: string;
  postValue: number;
  metaPatch?: Record<string, unknown>;
}

export interface EvaluateImpactResult {
  ok: boolean;
  impactId?: string;
  postValue?: number;
  table?: ImpactTable;
  metaApplied?: boolean;
  error?: string;
}

export async function evaluateImpact(
  input: EvaluateImpactInput
): Promise<EvaluateImpactResult> {
  const supabase = supabaseServer();
  const { impactId, postValue, metaPatch } = input;

  if (!impactId) {
    return { ok: false, error: "Missing impactId" };
  }

  const tables: ImpactTable[] = [
    "agent_impact",
    "agent_marketing_impact",
  ];

  let foundTable: ImpactTable | null = null;

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("id", impactId)
      .limit(1);

    if (error) {
      return { ok: false, error: error.message };
    }

    if (data && data.length > 0) {
      foundTable = table;
      break;
    }
  }

  if (!foundTable) {
    return { ok: false, error: "Impact not found" };
  }

  const updatePayload: Record<string, unknown> = {
    post_value: postValue,
  };

  let metaApplied = false;

  if (metaPatch && Object.keys(metaPatch).length > 0) {
    const { data: currentRows, error: fetchError } = await supabase
      .from(foundTable)
      .select("meta")
      .eq("id", impactId)
      .limit(1);

    if (fetchError) {
      return { ok: false, error: fetchError.message };
    }

    if (currentRows && currentRows.length > 0) {
      const currentMeta =
        (currentRows[0] as { meta?: Record<string, unknown> }).meta || {};

      updatePayload.meta = {
        ...currentMeta,
        ...metaPatch,
      };

      metaApplied = true;
    }
  }

  // 1️⃣ Update impact row
  const { error: updateError } = await supabase
    .from(foundTable)
    .update(updatePayload)
    .eq("id", impactId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // 2️⃣ Insert measurement (temporal trajectory)
  const { error: measurementError } = await supabase
    .from("impact_measurements")
    .insert({
      impact_id: impactId,
      measured_value: postValue,
      source: "impact_evaluate_endpoint",
      meta: metaPatch ?? {},
    });

  if (measurementError) {
    return { ok: false, error: measurementError.message };
  }

  return {
    ok: true,
    impactId,
    postValue,
    table: foundTable,
    metaApplied,
  };
}