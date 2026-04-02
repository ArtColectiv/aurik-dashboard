/**
 * DRY RUN — test complet du flow runExperimentAutonomy
 *
 * Teste toutes les couches logiques avec un agent fictif,
 * sans écrire en base de données.
 *
 * Usage:
 *   npx tsx scripts/test-experiment-autonomy.ts
 */

import {
  predictExperimentOutcomes,
  type ExperimentStat,
} from "../lib/aurik/learning/experimentPrediction";
import {
  decideAutonomy,
  type AutonomyDecision,
} from "../lib/aurik/autonomy/experimentAutonomy";
import { getMarketingExperimentByKey } from "../lib/aurik/decision/marketingExperimentRegistry";

// ─── CONFIG DRY RUN ──────────────────────────────────────────────────────────

const FAKE_AGENT = "marketing-agent-dry-run";

// Simule les données qui viendraient de agent_experiment_outcomes
const FAKE_STATS: ExperimentStat[] = [
  // Cas safe_override : 3 runs, 0 failure, 100% neutral → safe_override attendu
  {
    experimentKey: "increase_posting_frequency",
    runs: 3,
    successCount: 0,
    neutralCount: 3,
    failureCount: 0,
    successRate: 0,
    avgDeltaPct: 0.02,
  },
  // Cas auto_run : 12 runs, 83% success, high confidence → auto_run attendu
  {
    experimentKey: "ab_test",
    runs: 12,
    successCount: 10,
    neutralCount: 2,
    failureCount: 0,
    successRate: 0.833,
    avgDeltaPct: 0.15,
  },
  // Cas no_action : 2 runs, 1 failure → bloqué
  {
    experimentKey: "test_new_channel",
    runs: 2,
    successCount: 1,
    neutralCount: 0,
    failureCount: 1,
    successRate: 0.5,
    avgDeltaPct: 0.05,
  },
];

const EXPERIMENT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function log(label: string, data: unknown) {
  console.log(`\n▸ ${label}`);
  console.log(JSON.stringify(data, null, 2));
}

function assertDecision(
  experimentKey: string,
  actual: AutonomyDecision,
  expected: AutonomyDecision["decision"]
) {
  const ok = actual.decision === expected;
  const icon = ok ? "✅" : "❌";
  console.log(
    `  ${icon} ${experimentKey}: décision="${actual.decision}" (attendu="${expected}") — ${actual.reason}`
  );
  if (!ok) {
    process.exitCode = 1;
  }
}

// ─── ÉTAPE 1 : prédictions ────────────────────────────────────────────────────

section("ÉTAPE 1 — predictExperimentOutcomes()");
const predictions = predictExperimentOutcomes(FAKE_STATS);
log("Prédictions triées par predictionScore", predictions);

// ─── ÉTAPE 2 : décisions par cas ─────────────────────────────────────────────

section("ÉTAPE 2 — decideAutonomy() par scénario");

console.log("");
for (const pred of predictions) {
  const stat = FAKE_STATS.find((s) => s.experimentKey === pred.experimentKey)!;
  const totalRuns = stat.runs;
  const successRate = totalRuns > 0 ? stat.successCount / totalRuns : 0;
  const failureRate = totalRuns > 0 ? stat.failureCount / totalRuns : 0;

  const decision = decideAutonomy({
    autoRunEligible: pred.autoRunEligible,
    stats: {
      confidence: pred.confidence,
      successRate,
      failureRate,
      neutralRate: pred.neutralRate,
      totalRuns,
    },
    alreadyRunning: false,
    cooldownActive: false,
  });

  assertDecision(
    pred.experimentKey,
    decision,
    pred.experimentKey === "ab_test"
      ? "auto_run"
      : pred.experimentKey === "increase_posting_frequency"
      ? "safe_override"
      : "no_action"
  );
}

// ─── ÉTAPE 3 : sélection du meilleur experiment ───────────────────────────────

section("ÉTAPE 3 — Sélection du meilleur experiment");

const bestPrediction = predictions[0];
log("Meilleur experiment sélectionné", {
  experimentKey: bestPrediction.experimentKey,
  predictionScore: bestPrediction.predictionScore,
  confidence: bestPrediction.confidence,
  autoRunEligible: bestPrediction.autoRunEligible,
  autoRunReason: bestPrediction.autoRunReason,
});

// ─── ÉTAPE 4 : état running / cooldown (mock) ────────────────────────────────

section("ÉTAPE 4 — État running / cooldown (mock DB)");

const scenarios: Array<{
  label: string;
  isRunning: boolean;
  latestStartedAt: string | null;
}> = [
  { label: "Pas démarré, pas de cooldown", isRunning: false, latestStartedAt: null },
  {
    label: "Cooldown actif (démarré il y a 2h)",
    isRunning: false,
    latestStartedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    label: "Cooldown expiré (démarré il y a 7h)",
    isRunning: false,
    latestStartedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
  },
  {
    label: "Déjà en cours d'exécution",
    isRunning: true,
    latestStartedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
];

const stat = FAKE_STATS.find((s) => s.experimentKey === bestPrediction.experimentKey)!;

console.log("");
for (const scenario of scenarios) {
  const cooldownRemainingMs = (() => {
    if (!scenario.latestStartedAt) return 0;
    const ts = new Date(scenario.latestStartedAt).getTime();
    const remaining = EXPERIMENT_COOLDOWN_MS - (Date.now() - ts);
    return remaining > 0 ? remaining : 0;
  })();

  const cooldownActive = cooldownRemainingMs > 0 && !scenario.isRunning;

  const decision = decideAutonomy({
    autoRunEligible: bestPrediction.autoRunEligible,
    stats: {
      confidence: bestPrediction.confidence,
      successRate: stat.runs > 0 ? stat.successCount / stat.runs : 0,
      failureRate: stat.runs > 0 ? stat.failureCount / stat.runs : 0,
      neutralRate: bestPrediction.neutralRate,
      totalRuns: stat.runs,
    },
    alreadyRunning: scenario.isRunning,
    cooldownActive,
  });

  const icon =
    decision.decision === "auto_run"
      ? "🟢"
      : decision.decision === "safe_override"
      ? "🟡"
      : "🔴";

  console.log(`  ${icon} [${scenario.label}]`);
  console.log(
    `     → décision="${decision.decision}" | raison="${decision.reason}"`
  );
  if (cooldownActive) {
    const remainingMin = Math.round(cooldownRemainingMs / 60000);
    console.log(`     → cooldown restant: ~${remainingMin} min`);
  }
}

// ─── ÉTAPE 5 : simulation du flow complet ────────────────────────────────────

section("ÉTAPE 5 — Simulation du flow runExperimentAutonomy complet");

const finalDecision = decideAutonomy({
  autoRunEligible: bestPrediction.autoRunEligible,
  stats: {
    confidence: bestPrediction.confidence,
    successRate: stat.runs > 0 ? stat.successCount / stat.runs : 0,
    failureRate: stat.runs > 0 ? stat.failureCount / stat.runs : 0,
    neutralRate: bestPrediction.neutralRate,
    totalRuns: stat.runs,
  },
  alreadyRunning: false,
  cooldownActive: false,
});

const experiment = getMarketingExperimentByKey(bestPrediction.experimentKey);

console.log(`
  Agent       : ${FAKE_AGENT}
  Experiment  : ${bestPrediction.experimentKey}
  Décision    : ${finalDecision.decision}
  Risk Level  : ${finalDecision.riskLevel}
  Raison      : ${finalDecision.reason}
  Executable  : ${experiment?.executable ?? false}
`);

if (finalDecision.decision === "no_action") {
  console.log("  [DRY RUN] → Aucune action. Fin du flow.");
} else {
  console.log("  [DRY RUN] → Insérerait dans agent_events :");
  console.log(
    JSON.stringify(
      {
        agent_name: FAKE_AGENT,
        event_type: "marketing_experiment_started",
        payload: {
          experimentKey: bestPrediction.experimentKey,
          decision: finalDecision.decision,
        },
      },
      null,
      4
    )
  );

  if (experiment?.executable && experiment.actionKey) {
    console.log("\n  [DRY RUN] → executeAction() serait appelé :");
    console.log(
      JSON.stringify(
        {
          actionType: "create_social_post",
          content: experiment.description,
          agentName: FAKE_AGENT,
          experimentKey: bestPrediction.experimentKey,
        },
        null,
        4
      )
    );
  } else {
    console.log(
      "\n  [DRY RUN] → executeAction() ignoré (experiment.executable = false)"
    );
  }
}

section("RÉSULTAT FINAL");
const allPassed = process.exitCode !== 1;
console.log(allPassed ? "\n  ✅ Tous les tests passent\n" : "\n  ❌ Certains tests ont échoué\n");
