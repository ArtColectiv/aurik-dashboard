export type MarketingExperimentOutcome = {
  beforeValue: number
  afterValue: number
  delta: number
  deltaPct: number
  outcome: "success" | "neutral" | "failure"
}

export function computeMarketingExperimentOutcome(
  beforeValue: number,
  afterValue: number
): MarketingExperimentOutcome {

  const delta = afterValue - beforeValue

  const deltaPct =
    beforeValue === 0 ? 0 : delta / beforeValue

  let outcome: "success" | "neutral" | "failure"

  if (deltaPct > 0.1) {
    outcome = "success"
  } else if (deltaPct < -0.05) {
    outcome = "failure"
  } else {
    outcome = "neutral"
  }

  return {
    beforeValue,
    afterValue,
    delta,
    deltaPct,
    outcome
  }
}