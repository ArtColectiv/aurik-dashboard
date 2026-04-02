// app/api/marketing/generate-image/route.ts

import { NextResponse } from 'next/server';
import { marketingSkillPack } from '@/lib/aurik/skillpacks/marketingSkillPack';

type PlatformInput = 'instagram' | 'facebook' | 'tiktok' | 'linkedin';
type GoalInput =
  | 'awareness'
  | 'engagement'
  | 'conversion'
  | 'event_promotion'
  | 'generic';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const agentName = String(body.agentName ?? '').trim();
    const platform = (body.platform ?? 'instagram') as PlatformInput;
    const goalType = (body.goalType ?? 'generic') as GoalInput;

    const goalDescription = String(
      body.goalDescription ??
        body.subject ??
        'Visuel marketing généré par Aurik.',
    );

    const prompt =
      typeof body.prompt === 'string' && body.prompt.trim().length > 0
        ? body.prompt.trim()
        : undefined;

    if (!agentName) {
      return NextResponse.json(
        { error: 'agentName manquant.' },
        { status: 400 },
      );
    }

    // 1) Appel au Skill Pack marketing pour générer l'image IA
    const image = await marketingSkillPack.generateMarketingImage({
      agentName,
      platform,
      goalType,
      goalDescription,
      prompt,
    });

    // 2) Si OpenAI n'a pas renvoyé d'URL (filtre, erreur, etc.),
    // on renvoie quand même le prompt + altText mais avec imageUrl = null
    if (!image.imageUrl) {
      return NextResponse.json(
        {
          image: {
            ...image,
            imageUrl: null,
          },
        },
        { status: 200 },
      );
    }

    // 3) Succès : on renvoie l'image complète
    return NextResponse.json(
      {
        image,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error(
      '[Aurik] Erreur inattendue dans /api/marketing/generate-image:',
      err,
    );

    return NextResponse.json(
      {
        error:
          err?.message ??
          "Erreur inconnue lors de la génération de l'image marketing.",
      },
      { status: 500 },
    );
  }
}
