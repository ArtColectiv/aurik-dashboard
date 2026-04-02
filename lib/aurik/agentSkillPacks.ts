// lib/aurik/agentSkillPacks.ts

const agentSkillPacksMap: Record<string, string[]> = {
  // Agent de test que tu utilises déjà avec le curl
  "debug-agent": ["debug", "marketing"],

  // Plus tard tu pourras ajouter d'autres agents ici :
  // "aurik-marketing-1": ["marketing", "action"],
};

export function getSkillPackIdsForAgent(agentId: string): string[] {
  const installed = agentSkillPacksMap[agentId];

  if (Array.isArray(installed)) {
    return installed;
  }

  // Par défaut, pour l'instant, on donne debug + marketing à tous les agents inconnus
  return ["debug", "marketing"];
}

export function hasSkillPackInstalled(
  agentId: string,
  skillPackId: string
): boolean {
  const installed = getSkillPackIdsForAgent(agentId);
  return installed.includes(skillPackId);
}
