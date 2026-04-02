export type Agent = {
  id: string; // UUID (source of truth)
  agent_name: string; // slug unique
  aurik_score: number;
  aurik_experience_capital: number;
  created_at: string;
};