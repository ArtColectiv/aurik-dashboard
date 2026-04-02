export type MarketingExperiment = {
  key: string;
  title: string;
  description: string;
  executable: boolean;
  skillPackKey: string | null;
  actionKey: string | null;
};

export const MARKETING_EXPERIMENT_REGISTRY: Record<string, MarketingExperiment> = {
  increase_budget: {
    key: "increase_budget",
    title: "Increase budget",
    description: "Increase advertising budget by 20% on the best performing channel",
    executable: false,
    skillPackKey: "marketing_ads",
    actionKey: "increase_budget_20_pct",
  },

  duplicate_winning_campaign: {
    key: "duplicate_winning_campaign",
    title: "Duplicate winning campaign",
    description: "Duplicate the best performing campaign to a similar audience segment",
    executable: false,
    skillPackKey: "marketing_campaigns",
    actionKey: "duplicate_best_campaign",
  },

  launch_retargeting: {
    key: "launch_retargeting",
    title: "Launch retargeting",
    description: "Create a retargeting campaign targeting recent visitors",
    executable: false,
    skillPackKey: "marketing_ads",
    actionKey: "launch_retargeting_campaign",
  },

  repeat_successful_action: {
    key: "repeat_successful_action",
    title: "Repeat successful action",
    description: "Repeat the last successful campaign to confirm stability",
    executable: false,
    skillPackKey: "marketing_campaigns",
    actionKey: "repeat_last_successful_campaign",
  },

  reduce_variability: {
    key: "reduce_variability",
    title: "Reduce variability",
    description: "Focus on one or two channels to stabilize performance",
    executable: false,
    skillPackKey: "marketing_strategy",
    actionKey: "reduce_channel_variability",
  },

  improve_content_quality: {
    key: "improve_content_quality",
    title: "Improve content quality",
    description: "Optimize creatives or messaging before scaling further",
    executable: false,
    skillPackKey: "marketing_content",
    actionKey: "optimize_creatives_and_copy",
  },

  pause_underperforming_campaigns: {
    key: "pause_underperforming_campaigns",
    title: "Pause underperforming campaigns",
    description: "Pause campaigns with negative momentum",
    executable: false,
    skillPackKey: "marketing_ads",
    actionKey: "pause_underperforming_campaigns",
  },

  analyze_recent_changes: {
    key: "analyze_recent_changes",
    title: "Analyze recent changes",
    description: "Review recent campaign adjustments that may have caused the decline",
    executable: false,
    skillPackKey: "marketing_analysis",
    actionKey: "analyze_recent_campaign_changes",
  },

  test_new_strategy: {
    key: "test_new_strategy",
    title: "Test a new strategy",
    description: "Run a small experiment with a new audience or format",
    executable: false,
    skillPackKey: "marketing_experiments",
    actionKey: "launch_new_strategy_test",
  },

  collect_more_data: {
    key: "collect_more_data",
    title: "Collect more data",
    description: "Run small experiments to gather additional measurements",
    executable: false,
    skillPackKey: "marketing_experiments",
    actionKey: "collect_more_measurements",
  },

  test_new_channel: {
    key: "test_new_channel",
    title: "Test new channel",
    description: "Experiment with a new marketing channel",
    executable: false,
    skillPackKey: "marketing_experiments",
    actionKey: "test_new_channel",
  },

  increase_posting_frequency: {
    key: "increase_posting_frequency",
    title: "Increase posting frequency",
    description: "Increase activity to generate measurable signals",
    executable: false,
    skillPackKey: "marketing_content",
    actionKey: "increase_posting_frequency",
  },

  small_optimization: {
    key: "small_optimization",
    title: "Small optimization",
    description: "Test minor improvements to messaging or targeting",
    executable: false,
    skillPackKey: "marketing_experiments",
    actionKey: "run_small_optimization_test",
  },

  ab_test: {
    key: "ab_test",
    title: "A/B test",
    description: "Run an A/B test to identify the best performing variant",
    executable: false,
    skillPackKey: "marketing_experiments",
    actionKey: "run_ab_test",
  },

  improve_consistency: {
    key: "improve_consistency",
    title: "Improve consistency",
    description: "Maintain consistent campaign cadence and monitor results",
    executable: false,
    skillPackKey: "marketing_strategy",
    actionKey: "improve_campaign_consistency",
  },
};

export function getMarketingExperimentByKey(key: string): MarketingExperiment | null {
  return MARKETING_EXPERIMENT_REGISTRY[key] ?? null;
}