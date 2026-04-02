export type MarketingTrajectoryScore = {
  baseline: number
  current: number
  growth: number
  momentum: number
  stability: number
  compositeScore: number
}

export type MarketingDecisionState =
  | "explore"
  | "monitor"
  | "accelerate"
  | "stabilize"
  | "correct"

export type MarketingDecision = {
  state: MarketingDecisionState
  reason: string
  recommendedAction: string
}

export function computeMarketingDecision(
  score: MarketingTrajectoryScore,
  pointsCount: number
): MarketingDecision {

  if (pointsCount < 3) {
    return {
      state: "explore",
      reason: "Not enough measurements to evaluate trajectory",
      recommendedAction: "Collect more data points before making strategic adjustments"
    }
  }

  if (score.momentum < 0) {
    return {
      state: "correct",
      reason: "Momentum is negative, trajectory declining",
      recommendedAction: "Investigate recent actions and stop underperforming campaigns"
    }
  }

  if (score.growth > 0.5 && score.momentum > 0 && score.stability < 0.4) {
    return {
      state: "accelerate",
      reason: "Strong growth and positive momentum with stable trajectory",
      recommendedAction: "Increase investment in the best performing channel"
    }
  }

  if (score.growth > 0.5 && score.stability >= 0.4) {
    return {
      state: "stabilize",
      reason: "Good growth but trajectory is volatile",
      recommendedAction: "Repeat successful actions before scaling further"
    }
  }

  return {
    state: "monitor",
    reason: "Performance is stable but not strongly improving",
    recommendedAction: "Continue monitoring and test small optimizations"
  }
}