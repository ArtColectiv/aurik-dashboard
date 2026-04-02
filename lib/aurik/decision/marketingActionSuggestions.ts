export type MarketingDecisionState =
  | "explore"
  | "monitor"
  | "accelerate"
  | "stabilize"
  | "correct";

export type MarketingActionSuggestion = {
  key: string;
  title: string;
  description: string;
};

export function getMarketingActionSuggestions(
  state: MarketingDecisionState
): MarketingActionSuggestion[] {

  switch (state) {

    case "accelerate":
      return [
        {
          key: "increase_budget",
          title: "Increase budget",
          description: "Increase advertising budget by 20% on the best performing channel"
        },
        {
          key: "duplicate_winning_campaign",
          title: "Duplicate winning campaign",
          description: "Duplicate the best performing campaign to a similar audience segment"
        },
        {
          key: "launch_retargeting",
          title: "Launch retargeting",
          description: "Create a retargeting campaign targeting recent visitors"
        }
      ];

    case "stabilize":
      return [
        {
          key: "repeat_successful_action",
          title: "Repeat successful action",
          description: "Repeat the last successful campaign to confirm stability"
        },
        {
          key: "reduce_variability",
          title: "Reduce variability",
          description: "Focus on one or two channels to stabilize performance"
        },
        {
          key: "improve_content_quality",
          title: "Improve content quality",
          description: "Optimize creatives or messaging before scaling further"
        }
      ];

    case "correct":
      return [
        {
          key: "pause_underperforming_campaigns",
          title: "Pause underperforming campaigns",
          description: "Pause campaigns with negative momentum"
        },
        {
          key: "analyze_recent_changes",
          title: "Analyze recent changes",
          description: "Review recent campaign adjustments that may have caused the decline"
        },
        {
          key: "test_new_strategy",
          title: "Test a new strategy",
          description: "Run a small experiment with a new audience or format"
        }
      ];

    case "explore":
      return [
        {
          key: "collect_more_data",
          title: "Collect more data",
          description: "Run small experiments to gather additional measurements"
        },
        {
          key: "test_new_channel",
          title: "Test new channel",
          description: "Experiment with a new marketing channel"
        },
        {
          key: "increase_posting_frequency",
          title: "Increase posting frequency",
          description: "Increase activity to generate measurable signals"
        }
      ];

    case "monitor":
    default:
      return [
        {
          key: "small_optimization",
          title: "Small optimization",
          description: "Test minor improvements to messaging or targeting"
        },
        {
          key: "ab_test",
          title: "A/B test",
          description: "Run an A/B test to identify the best performing variant"
        },
        {
          key: "improve_consistency",
          title: "Improve consistency",
          description: "Maintain consistent campaign cadence and monitor results"
        }
      ];
  }
}