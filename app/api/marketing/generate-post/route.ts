// app/api/marketing/generate-post/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { marketingSkillPack } from '@/lib/aurik/skillpacks/marketingSkillPack';
import type { BrandProfile } from '@/lib/aurik/marketing/brandProfile';

const ECOSYSTEM_ID = 'default';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      '[Aurik] SUPABASE config manquante pour /api/marketing/generate-post.'
    );
    throw new Error('Supabase configuration missing');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

type VisualMode = 'none' | 'library' | 'ai';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const agentName = String(body.agentName ?? '').trim();

    const platform = String(body.platform ?? 'instagram') as
      | 'instagram'
      | 'facebook'
      | 'tiktok'
      | 'linkedin';

    const goalType = (body.goalType ?? 'generic') as
      | 'awareness'
      | 'engagement'
      | 'conversion'
      | 'event_promotion'
      | 'generic';

    const goalDescription = String(
      body.goalDescription ??
        'Post généré automatiquement par le Skill Pack Marketing Aurik.'
    );

    const visualMode: VisualMode = (body.visualMode ?? 'none') as VisualMode;

    if (!agentName) {
      return NextResponse.json(
        { error: 'agentName manquant.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // 1) Charger le brand profile (si disponible)
    let brandProfile: BrandProfile = {
      brandName: agentName,
    } as any;

    const { data: brandRow, error: brandError } = await supabase
      .from('marketing_brand_profiles')
      .select('profile')
      .eq('ecosystem_id', ECOSYSTEM_ID)
      .eq('agent_name', agentName)
      .maybeSingle();

    if (brandError) {
      console.error(
        '[Aurik] Erreur lecture marketing_brand_profiles (generate-post):',
        brandError
      );
    } else if (brandRow?.profile) {
      brandProfile = brandRow.profile as BrandProfile;
    }

    // 2) Préférences apprises (optionnel)
    let preferences: any = undefined;
    try {
      const { data: metricsRow, error: metricsError } = await supabase
        .from('agent_metrics')
        .select('marketing_preferences')
        // ⚠️ on enlève ecosystem_id car ta table ne l’a pas
        .eq('agent_name', agentName)
        .maybeSingle();

      if (metricsError) {
        console.error(
          '[Aurik] Erreur lecture agent_metrics.marketing_preferences (generate-post):',
          metricsError
        );
      } else if (metricsRow?.marketing_preferences) {
        preferences = metricsRow.marketing_preferences;
      }
    } catch (err) {
      console.error(
        '[Aurik] Exception en lisant agent_metrics.marketing_preferences:',
        err
      );
    }

    // 3) Génération du post via le Skill Pack Marketing
    const post = await marketingSkillPack.generateMarketingPost({
      agentName,
      brandProfile,
      platform,
      goalType,
      goalDescription,
      preferences,
    });

    // 4) Sauvegarde dans marketing_generated_posts (best effort)
    try {
      const { error: insertError } = await supabase
        .from('marketing_generated_posts')
        .insert({
          ecosystem_id: ECOSYSTEM_ID,
          agent_name: agentName,
          post_type: `${platform}_post`,
          prompt_subject: goalDescription,
          content_hook: post.copy?.hook ?? null,
          content_caption: post.copy?.caption ?? null,
          content_cta: post.copy?.callToAction ?? null,
          content_hashtags: post.copy?.hashtags ?? [],
          visual_mode: visualMode,
          visual_image_id: null, // on branchera la médiathèque plus tard
          visual_prompt: post.image?.prompt ?? null,
          visual_alt: post.image?.altText ?? null,
        });

      if (insertError) {
        console.error(
          '[Aurik] Erreur insertion marketing_generated_posts:',
          insertError
        );
      }
    } catch (err) {
      console.error(
        '[Aurik] Exception lors de l’insertion marketing_generated_posts:',
        err
      );
    }

    // 5) Réponse au frontend
    return NextResponse.json(
      {
        post,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(
      '[Aurik] Erreur inattendue dans /api/marketing/generate-post:',
      err
    );

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Erreur inconnue lors de la génération du post marketing.',
      },
      { status: 500 }
    );
  }
}
