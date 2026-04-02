// lib/aurik/marketing/types.ts

// Plateformes supportées pour le marketing
export type SupportedPlatform = 'instagram' | 'facebook' | 'tiktok' | 'linkedin';

// Objectifs possibles pour un contenu (post / reel, etc.)
export type ContentGoalType =
  | 'awareness'
  | 'engagement'
  | 'conversion'
  | 'event_promotion'
  | 'generic';

// Structure « proche » du contenu généré pour un post
export type PostCopyLike = {
  hook?: string | null;
  caption?: string | null;
  callToAction?: string | null;
  hashtags?: string[] | null;
};
