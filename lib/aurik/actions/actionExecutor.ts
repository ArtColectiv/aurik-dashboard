// lib/aurik/actions/actionExecutor.ts

import { evaluateActionPolicy, PolicyContext } from "./policyEngine";
import {
  postReelToInstagram,
  postImageToInstagram,
  InstagramPostResult,
} from "./instagramClient";

// ─── TYPES ───────────────────────────────────────────────────

export type ActionPayload =
  | {
      actionType: "post_reel_to_instagram";
      videoUrl: string;
      caption: string;
      agentName: string;
      experimentKey?: string;
    }
  | {
      actionType: "post_image_to_instagram";
      imageUrl: string;
      caption: string;
      agentName: string;
      experimentKey?: string;
    }
  | {
      actionType: "create_social_post";
      content: string;
      agentName: string;
      experimentKey?: string;
    };

export type ActionResult = {
  ok: boolean;
  actionType: string;
  policyDecision: string;
  dryRun?: boolean;
  mediaId?: string;
  postId?: string;
  skipped?: boolean;
  error?: string;
};

// ─── EXECUTOR ────────────────────────────────────────────────

export async function executeAction(
  payload: ActionPayload,
  context: PolicyContext
): Promise<ActionResult> {
  // 1. Vérifier la policy AVANT d'exécuter
  const policyDecision = evaluateActionPolicy(
    payload.actionType,
    context
  );

  // 2. Rejeter si pas autorisé
  if (policyDecision === "REJECT") {
    return {
      ok: false,
      actionType: payload.actionType,
      policyDecision,
      error: "Action rejected by policy engine",
    };
  }

  // 3. Skip si validation humaine requise
  // (dans une prochaine étape, on enverra une notification)
  if (policyDecision === "REQUIRE_HUMAN_VALIDATION") {
    return {
      ok: true,
      actionType: payload.actionType,
      policyDecision,
      skipped: true,
      error: "Awaiting human validation",
    };
  }

  // 4. AUTO_EXECUTE → brancher sur le bon client
  try {
    switch (payload.actionType) {
      case "post_reel_to_instagram": {
        const result: InstagramPostResult = await postReelToInstagram({
          videoUrl: payload.videoUrl,
          caption: payload.caption,
          agentName: payload.agentName,
          experimentKey: payload.experimentKey,
        });

        return {
          ok: result.ok,
          actionType: payload.actionType,
          policyDecision,
          dryRun: result.dryRun,
          mediaId: result.mediaId,
          postId: result.postId,
          error: result.error,
        };
      }

      case "post_image_to_instagram": {
        const result: InstagramPostResult = await postImageToInstagram({
          imageUrl: payload.imageUrl,
          caption: payload.caption,
          agentName: payload.agentName,
          experimentKey: payload.experimentKey,
        });

        return {
          ok: result.ok,
          actionType: payload.actionType,
          policyDecision,
          dryRun: result.dryRun,
          mediaId: result.mediaId,
          postId: result.postId,
          error: result.error,
        };
      }

      case "create_social_post": {
        // Placeholder — à brancher sur d'autres plateformes plus tard
        console.log(
          `[ACTION] create_social_post for ${payload.agentName}:`,
          payload.content
        );
        return {
          ok: true,
          actionType: payload.actionType,
          policyDecision,
          dryRun: true,
        };
      }

      default: {
        return {
          ok: false,
          actionType: (payload as ActionPayload).actionType,
          policyDecision,
          error: "Unknown actionType",
        };
      }
    }
  } catch (error) {
    return {
      ok: false,
      actionType: payload.actionType,
      policyDecision,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}