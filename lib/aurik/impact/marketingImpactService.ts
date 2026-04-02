// lib/aurik/impact/marketingImpactService.ts

import { supabaseServer } from "@/lib/aurik/supabaseServer";

export async function createMarketingBaseline(params: {
  agentId: string;
  actionType: string;
  metric: string;
  baselineValue: number;
}) {
  const s = supabaseServer();

  const { error } = await s.from("agent_marketing_impact").insert([
    {
      agent_id: params.agentId,
      action_type: params.actionType,
      metric: params.metric,
      baseline_value: params.baselineValue,
      status: "pending",
    },
  ]);

  if (error) throw new Error(error.message);
}

export async function evaluateMarketingImpact(params: {
  impactId: string;
  postValue: number;
}) {
  const s = supabaseServer();

  const { data, error } = await s
    .from("agent_marketing_impact")
    .select("*")
    .eq("id", params.impactId)
    .single();

  if (error) throw new Error(error.message);

  const baseline = Number(data.baseline_value);
  const deltaPct =
    baseline === 0 ? 0 : ((params.postValue - baseline) / baseline) * 100;

  const confidence = Math.min(1, Math.abs(deltaPct) / 10);

  const { error: updateError } = await s
    .from("agent_marketing_impact")
    .update({
      post_value: params.postValue,
      delta_pct: deltaPct,
      confidence,
      status: "evaluated",
    })
    .eq("id", params.impactId);

  if (updateError) throw new Error(updateError.message);
}