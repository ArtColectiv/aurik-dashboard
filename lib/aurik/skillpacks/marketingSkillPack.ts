// lib/aurik/skillpacks/marketingSkillPack.ts
import OpenAI from 'openai';

import {
  BrandProfile,
  normalizeBrandProfile,
} from '../marketing/brandProfile';
import { safeChatCompletion } from '../openaiClient';
import {
  VisualBrief,
  buildVisualBriefForPost,
  visualBriefToPrompt,
} from '../marketing/visualBrief';
import {
  ContentGoalType,
  PostCopyLike,
  SupportedPlatform,
} from '../marketing/types';

// -----------------------------------------------------------------------------
// 0) CONSTANTES MODELES
// -----------------------------------------------------------------------------

const TEXT_MODEL =
  process.env.OPENAI_MARKETING_MODEL || 'gpt-4.1-mini';

const IMAGE_MODEL =
  process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

// -----------------------------------------------------------------------------
// 1) GENERATION DU TEXTE (COPY)
// -----------------------------------------------------------------------------

type GenerateCopyOptions = {
  agentName: string;
  brandProfile: BrandProfile;
  platform: SupportedPlatform;
  goalType: ContentGoalType;
  goalDescription: string;
  preferences?: any;
};

export async function generateMarketingCopy(
  options: GenerateCopyOptions,
): Promise<PostCopyLike> {
  const normalizedBrand = normalizeBrandProfile(options.brandProfile);

  const userPrompt = `
Tu es un expert en rédaction de contenus pour les réseaux sociaux.

[Profil de marque]
Nom: ${normalizedBrand.brandName || options.agentName}
Description: ${normalizedBrand.description || '—'}
Ton de voix: ${normalizedBrand.toneOfVoice || 'standard'}
Public cible: ${normalizedBrand.targetAudience || 'non précisé'}

[Plateforme]
${options.platform}

[Objectif]
Type: ${options.goalType}
Description détaillée: ${options.goalDescription}

[Préférences existantes]
${JSON.stringify(options.preferences ?? {}, null, 2)}

Répond STRICTEMENT au format JSON :

{
  "hook": "...",
  "caption": "...",
  "callToAction": "...",
  "hashtags": ["#...", "..."]
}
  `.trim();

  const completion = await safeChatCompletion({
    model: TEXT_MODEL,
    system:
      "Tu es un assistant spécialisé en rédaction de posts pour les réseaux sociaux. Tu respectes strictement le format JSON demandé.",
    userPrompt,
    response_format: { type: 'json_object' },
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(completion);
  } catch (err) {
    console.error(
      '[Aurik] Impossible de parser la réponse JSON (copy):',
      err,
      completion,
    );
  }

  const copy: PostCopyLike = {
    hook: parsed.hook ?? null,
    caption: parsed.caption ?? null,
    callToAction: parsed.callToAction ?? null,
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
  };

  return copy;
}

// -----------------------------------------------------------------------------
// 2) POST CLASSIQUE (TEXTE + IDEE DE VISUEL IA TEXTUELLE)
// -----------------------------------------------------------------------------

type GeneratePostOptions = {
  agentName: string;
  brandProfile: BrandProfile;
  platform: SupportedPlatform;
  goalType: ContentGoalType;
  goalDescription: string;
  preferences?: any;
};

export async function generateMarketingPost(options: GeneratePostOptions) {
  const copy = await generateMarketingCopy(options);

  const visualBrief: VisualBrief = buildVisualBriefForPost({
    platform: options.platform,
    goalType: options.goalType,
    goalDescription: options.goalDescription,
    subject: options.goalDescription,
    copy,
  });

  const imagePrompt = visualBriefToPrompt(visualBrief);

  return {
    copy,
    image: {
      prompt: imagePrompt,
      altText: imagePrompt.slice(0, 200),
    },
  };
}

// -----------------------------------------------------------------------------
// 3) REEL / VIDEO COURTE
// -----------------------------------------------------------------------------

type GenerateReelOptions = GeneratePostOptions;

export async function generateMarketingReel(
  options: GenerateReelOptions,
) {
  const normalizedBrand = normalizeBrandProfile(options.brandProfile);

  const userPrompt = `
Tu es un expert en création de Reels / vidéos courtes pour les réseaux sociaux.
Tu conçois des scripts structurés, adaptés à la marque et à la plateforme.
Tu respectes les contraintes de temps (15–45 secondes) et l'attention du public.

[Profil de marque]
Nom: ${normalizedBrand.brandName || options.agentName}
Description: ${normalizedBrand.description || '—'}
Ton de voix: ${normalizedBrand.toneOfVoice || 'standard'}
Public cible: ${normalizedBrand.targetAudience || 'non précisé'}

[Plateforme]
${options.platform}

[Objectif du reel]
Type: ${options.goalType}
Description détaillée: ${options.goalDescription}

Tâche :
- Propose un script découpé en 3 à 7 étapes (phrases ou scènes).
- Génère aussi une caption optimisée.
- Ajoute un call-to-action cohérent.
- Propose une liste de hashtags (5 à 12).
- Propose une idée de cover (image fixe) pour le reel.

Répond STRICTEMENT au format JSON :

{
  "scriptSteps": ["...", "..."],
  "caption": "...",
  "callToAction": "...",
  "hashtags": ["#...", "..."],
  "cover": {
    "prompt": "...",
    "altText": "..."
  }
}
  `.trim();

  const completion = await safeChatCompletion({
    model: TEXT_MODEL,
    system:
      "Tu es un assistant spécialisé en création de scripts pour Reels / vidéos courtes. Tu respectes strictement le format JSON demandé.",
    userPrompt,
    response_format: { type: 'json_object' },
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(completion);
  } catch (err) {
    console.error(
      '[Aurik] Impossible de parser la réponse JSON (reel):',
      err,
      completion,
    );
  }

  return {
    scriptSteps: Array.isArray(parsed.scriptSteps)
      ? parsed.scriptSteps
      : [],
    caption: parsed.caption ?? '',
    callToAction: parsed.callToAction ?? '',
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
    cover: parsed.cover ?? null,
    platform: options.platform,
  };
}

// -----------------------------------------------------------------------------
// 4) GENERATION D'IMAGE IA MARKETING
// -----------------------------------------------------------------------------

type GenerateMarketingImageOptions = {
  agentName: string;
  brandProfile?: BrandProfile | null;
  platform: SupportedPlatform;
  goalType: ContentGoalType;
  goalDescription: string;
  // Prompt texte déjà généré côté copy (facultatif)
  prompt?: string;
};

export async function generateMarketingImage(
  options: GenerateMarketingImageOptions,
) {
  // 1) Brief visuel à partir du contexte marketing
  const emptyCopy: PostCopyLike = {
    hook: '',
    caption: options.goalDescription,
    callToAction: undefined,
    hashtags: [],
  };

  const brief: VisualBrief = buildVisualBriefForPost({
    platform: options.platform,
    goalType: options.goalType,
    goalDescription: options.goalDescription,
    subject: options.goalDescription,
    copy: emptyCopy,
  });

  const basePrompt = visualBriefToPrompt(brief);

  const finalPrompt = options.prompt
    ? `${options.prompt}\n\nDétails visuels à respecter : ${basePrompt}`
    : basePrompt;

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  let imageUrl: string | null = null;

  try {
    const imgRes = await client.images.generate({
      model: IMAGE_MODEL,
      prompt: finalPrompt,
      n: 1,
      size: '1024x1024',
      // pas de response_format : on gère url ou b64_json ci-dessous
    });

    const first = (imgRes as any).data?.[0];

    if (first) {
      if (first.url) {
        imageUrl = first.url as string;
      } else if (first.b64_json) {
        imageUrl = `data:image/png;base64,${first.b64_json}`;
      }
    }
  } catch (err) {
    console.error(
      '[Aurik] Erreur OpenAI.generateMarketingImage:',
      err,
    );

    const formatHint =
      (brief as any).formatHint as string | undefined;

    return {
      prompt: finalPrompt,
      altText:
        formatHint ||
        `Visuel pour un post ${options.platform} : ${options.goalDescription}`,
      imageUrl: null,
      error: 'openai_error' as const,
    };
  }

  const formatHint =
    (brief as any).formatHint as string | undefined;

  return {
    prompt: finalPrompt,
    altText:
      formatHint ||
      `Visuel pour un post ${options.platform} : ${options.goalDescription}`,
    imageUrl,
    error: imageUrl ? null : ('no_url_returned' as const),
  };
}

// -----------------------------------------------------------------------------
// 5) EXPORT DU SKILL PACK
// -----------------------------------------------------------------------------

export const marketingSkillPack = {
  generateMarketingCopy,
  generateMarketingPost,
  generateMarketingImage,
  generateMarketingReel,
};
