import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { DB } from "@/lib/aurik/db";

export type Agent = {
  id: string;
  agent_name: string;
  aurik_score: number;
  aurik_experience_capital: number;
  created_at: string;
};

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

export async function getAgentBySlug(slug: string): Promise<Agent | null> {
  const normalized = normalizeSlug(slug);

  if (!normalized) return null;

  const supabase = supabaseServer();

  // ⚠️ Matching robuste côté DB
  const { data, error } = await supabase
    .from(DB.AGENTS_TABLE)
    .select("id, agent_name, aurik_score, aurik_experience_capital, created_at");

  if (error) {
    console.error("[getAgentBySlug] Supabase error:", error);
    return null;
  }

  const match = (data ?? []).find((row: any) => {
    return normalizeSlug(row.agent_name) === normalized;
  });

  return (match as Agent | null) ?? null;
}