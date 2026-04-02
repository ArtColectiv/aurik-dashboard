// lib/aurik/marketing/visualBrief.ts

import { BrandProfile } from './brandProfile';
import { SupportedPlatform, ContentGoalType, PostCopyLike } from './types';

// Représentation interne d’un "brief visuel" pour un post
export interface VisualBrief {
  platform: SupportedPlatform;
  goalType: ContentGoalType;
  goalDescription: string;
  subject: string;
  copy: PostCopyLike;

  agentName?: string;
  brandProfile?: BrandProfile | null;
  preferences?: any;

  formatHint?: string;
  moodKeywords?: string[];
}

// Fonction utilitaire : construit un VisualBrief à partir des infos du post
export function buildVisualBriefForPost(input: {
  platform: SupportedPlatform;
  goalType: ContentGoalType;
  goalDescription: string;
  subject: string;
  copy: PostCopyLike;
  agentName?: string;
  brandProfile?: BrandProfile | null;
  preferences?: any;
}): VisualBrief {
  return {
    platform: input.platform,
    goalType: input.goalType,
    goalDescription: input.goalDescription,
    subject: input.subject,
    copy: {
      hook: input.copy.hook ?? undefined,
      caption: input.copy.caption ?? undefined,
      callToAction: input.copy.callToAction ?? undefined,
      hashtags: input.copy.hashtags ?? undefined,
    },
    agentName: input.agentName,
    brandProfile: input.brandProfile ?? null,
    preferences: input.preferences,
    formatHint: undefined,
    moodKeywords: [],
  };
}

// Transforme le brief en prompt texte pour la génération d'image IA
export function visualBriefToPrompt(brief: VisualBrief): string {
  const lines: string[] = [];

  lines.push(
    `Tu génères un visuel marketing pour un post sur ${brief.platform}.`,
    `Objectif principal: ${brief.goalType} – ${brief.goalDescription}.`,
    `Sujet de la promotion / contenu: ${brief.subject}.`
  );

  const parts: string[] = [];
  if (brief.copy.hook) {
    parts.push(`Hook: "${brief.copy.hook}"`);
  }
  if (brief.copy.caption) {
    parts.push(`Caption: "${brief.copy.caption}"`);
  }
  if (brief.copy.callToAction) {
    parts.push(`Call-to-action: "${brief.copy.callToAction}"`);
  }
  if (brief.copy.hashtags && brief.copy.hashtags.length > 0) {
    parts.push(`Hashtags: ${brief.copy.hashtags.join(' ')}`);
  }

  if (parts.length > 0) {
    lines.push('Le visuel doit être cohérent avec le texte suivant :');
    lines.push(parts.join(' | '));
  }

  if (brief.brandProfile?.toneOfVoice) {
    lines.push(`Ton de marque: ${brief.brandProfile.toneOfVoice}.`);
  }

  if (brief.brandProfile?.colors?.primary || brief.brandProfile?.colors?.secondary) {
    const colors = [
      brief.brandProfile.colors?.primary,
      brief.brandProfile.colors?.secondary,
    ]
      .filter(Boolean)
      .join(', ');

    lines.push(`Couleurs de marque à favoriser: ${colors}.`);
  }

  lines.push(
    "Style: visuel marketing propre, lisible sur mobile, pas de texte trop long dans l'image."
  );

  return lines.join('\n');
}
