// lib/aurik/reels/types.ts

/* =========================================================
   REEL SCRIPT (A1 / A2)
   ========================================================= */

export type ReelPlatform = "instagram" | "tiktok" | "youtube_shorts";

export type ReelScene = {
  id: string;
  title?: string;

  // Texte affiché à l’écran
  onScreenText?: string;

  // Texte voix off
  voiceOverText?: string;

  // Prompt image pour cette scène
  imagePrompt?: string;

  // Durée cible (secondes) – utilisé par le renderer
  durationSec?: number;
};

export type ReelDraft = {
  jobId: string;
  createdAt: string;

  agentName?: string;
  subject?: string;

  platform: ReelPlatform;

  goalType?: string;
  goalDescription?: string;

  // Script structuré (si dispo)
  scenes?: ReelScene[];

  // Script simple (fallback – ce que tu as actuellement)
  scriptSteps?: string[];

  caption: string;
  callToAction?: string;
  hashtags: string[];

  coverPrompt?: string;

  meta?: {
    language?: string;
    tone?: string;

    rendererHint?: "ffmpeg" | "runway" | "luma" | "pika" | string;

    subtitles?: {
      enabled: boolean;
      style?: string;
    };

    music?: {
      enabled: boolean;
      mood?: string;
      ducking?: boolean;
    };
  };
};

/* =========================================================
   REEL VIDEO (A3+)
   ========================================================= */

export type RenderableScene = {
  id: string;

  // Texte maître (sert à la VO et au sens)
  text: string;

  // Prompt image FINAL utilisé par OpenAI Images
  imagePrompt: string;
};

export type ReelVideoResult =
  | {
      ok: true;
      reelId: string;
      videoUrl: string;
      videoStoragePath: string;
    }
  | {
      ok: false;
      reelId: string;
      error: string;
    };
