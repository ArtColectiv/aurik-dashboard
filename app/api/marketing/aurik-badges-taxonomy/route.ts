// app/api/marketing/aurik-badges-taxonomy/route.ts
import { NextResponse } from "next/server";
import { AURIK_SCORE_VERSION } from "@/lib/aurik/learning/aurikScoreVersion";

export const runtime = "nodejs";

type BadgeLevel = "INFO" | "PERFORMANCE" | "ELITE";

type BadgeTaxonomyItem = {
  code: string;
  label: string;
  level: BadgeLevel;
  description: string;
  rulesSummary: string;
};

const TAXONOMY: BadgeTaxonomyItem[] = [
  {
    code: "NEW",
    label: "New",
    level: "INFO",
    description: "Agent récent, en phase d’amorçage institutionnel.",
    rulesSummary: "experienceCapital ≤ 2",
  },
  {
    code: "CONSISTENT",
    label: "Consistent",
    level: "PERFORMANCE",
    description: "Progression positive au dernier cycle (croissance mensuelle visible).",
    rulesSummary: "delta1mScore ≥ 1",
  },
  {
    code: "RISING",
    label: "Rising",
    level: "PERFORMANCE",
    description: "Momentum positif significatif sur 3 mois. L’agent accélère.",
    rulesSummary: "momentum3mScore ≥ 250",
  },
  {
    code: "HIGH_VELOCITY",
    label: "High Velocity",
    level: "PERFORMANCE",
    description: "Très forte accélération récente. Trajectoire remarquable.",
    rulesSummary: "momentum3mScore ≥ 800",
  },
  {
    code: "STABLE",
    label: "Stable",
    level: "PERFORMANCE",
    description: "Score élevé et variations faibles : profil patrimonial, volatilité basse.",
    rulesSummary: "score ≥ 20k AND |delta1mScore| ≤ 150 AND |delta2mScore| ≤ 150",
  },
  {
    code: "DORMANT",
    label: "Dormant",
    level: "INFO",
    description: "Peu de mouvement sur 2 cycles (agent inactif ou données insuffisantes).",
    rulesSummary: "NOT NEW AND score ≥ 1k AND |delta1mScore| ≤ 10 AND |delta2mScore| ≤ 10",
  },
  {
    code: "ELITE",
    label: "Elite",
    level: "ELITE",
    description: "Agent “blue-chip” : score très élevé, forte valeur patrimoniale.",
    rulesSummary: "score ≥ 60k",
  },
];

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: AURIK_SCORE_VERSION,
    items: TAXONOMY,
  });
}
