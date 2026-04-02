// lib/aurik/actions/policyEngine.ts

import { ACTION_REGISTRY, RiskLevel } from "./actionRegistry";

export type PolicyDecision =
  | "REJECT"
  | "REQUIRE_HUMAN_VALIDATION"
  | "AUTO_EXECUTE";

export type PolicyContext = {
  agentLevel: number;
  activeSkillPacks: string[];
};

function riskAllowedAtLevel(risk: RiskLevel, level: number): boolean {
  if (level <= 2) return false; // no auto execution

  if (level >= 3 && risk === "LOW") return true;

  if (level >= 5 && (risk === "LOW" || risk === "MEDIUM"))
    return true;

  if (level >= 7 && (risk === "LOW" || risk === "MEDIUM" || risk === "HIGH"))
    return true;

  return false;
}

export function evaluateActionPolicy(
  actionType: string,
  context: PolicyContext,
): PolicyDecision {
  const def = ACTION_REGISTRY[actionType];

  if (!def) return "REJECT";

  if (!def.enabled) return "REJECT";

  if (!context.activeSkillPacks.includes(def.skillPack))
    return "REJECT";

  if (def.alwaysRequireHumanValidation)
    return "REQUIRE_HUMAN_VALIDATION";

  const canAuto = riskAllowedAtLevel(def.riskLevel, context.agentLevel);

  if (canAuto) return "AUTO_EXECUTE";

  return "REQUIRE_HUMAN_VALIDATION";
}