// lib/aurik/actions/actionRegistry.ts

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type SkillPack =
  | "marketing"
  | "finance"
  | "operations";

export type ActionDefinition = {
  actionType: string;
  skillPack: SkillPack;
  riskLevel: RiskLevel;

  /**
   * If true, even mature agents must pass through validation.
   * Used for financial / destructive actions.
   */
  alwaysRequireHumanValidation: boolean;

  /**
   * Whether this action is currently executable
   * (future-proofing for staged rollout).
   */
  enabled: boolean;
};

/**
 * CENTRAL ACTION REGISTRY (AAP-1 compatible)
 * Single source of truth for:
 * - Risk classification
 * - SkillPack mapping
 * - Validation requirements
 */
export const ACTION_REGISTRY: Record<string, ActionDefinition> = {
  // ======================
  // MARKETING
  // ======================

  create_social_post: {
    actionType: "create_social_post",
    skillPack: "marketing",
    riskLevel: "LOW",
    alwaysRequireHumanValidation: false,
    enabled: true,
  },

  post_reel_to_instagram: {
    actionType: "post_reel_to_instagram",
    skillPack: "marketing",
    riskLevel: "LOW",
    alwaysRequireHumanValidation: false,
    enabled: true,
  },

  post_image_to_instagram: {
    actionType: "post_image_to_instagram",
    skillPack: "marketing",
    riskLevel: "LOW",
    alwaysRequireHumanValidation: false,
    enabled: true,
  },

  launch_ads_campaign: {
    actionType: "launch_ads_campaign",
    skillPack: "marketing",
    riskLevel: "MEDIUM",
    alwaysRequireHumanValidation: false,
    enabled: true,
  },

  send_email_campaign: {
    actionType: "send_email_campaign",
    skillPack: "marketing",
    riskLevel: "MEDIUM",
    alwaysRequireHumanValidation: false,
    enabled: true,
  },

  // ======================
  // FINANCE
  // ======================

  adjust_price: {
    actionType: "adjust_price",
    skillPack: "finance",
    riskLevel: "HIGH",
    alwaysRequireHumanValidation: true,
    enabled: true,
  },

  issue_refund: {
    actionType: "issue_refund",
    skillPack: "finance",
    riskLevel: "HIGH",
    alwaysRequireHumanValidation: true,
    enabled: true,
  },

  generate_invoice: {
    actionType: "generate_invoice",
    skillPack: "finance",
    riskLevel: "LOW",
    alwaysRequireHumanValidation: false,
    enabled: true,
  },

  // ======================
  // OPERATIONS
  // ======================

  schedule_staff: {
    actionType: "schedule_staff",
    skillPack: "operations",
    riskLevel: "MEDIUM",
    alwaysRequireHumanValidation: false,
    enabled: true,
  },

  assign_task: {
    actionType: "assign_task",
    skillPack: "operations",
    riskLevel: "LOW",
    alwaysRequireHumanValidation: false,
    enabled: true,
  },
};