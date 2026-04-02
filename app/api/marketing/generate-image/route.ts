// app/api/marketing/generate-image/route.ts

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
      '[Aurik] SUPABASE config manquante pour /api/marketing/generate-image.'
    );
    throw new Error('Supabase configuration missing');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

type SupportedPlatform = 'instagram' | 'facebook' | 'tiktok' | 'linkedin';

type ContentGoalType =
  | 'awareness'
  | 'engagement'
  | 'conversion'
  | 'event_promotion'
  | 'generic';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const agentName = String(body.agentName ?? '').trim();
    const prompt = String(body.prompt ?? '').trim();

    const platform = String(body.platform ?? 'instagram') as SupportedPlatform;

    const goalType = (body.goalType ?? 'generic') as ContentGoalType;

    // ⚠ Ici on met des parenthèses pour éviter le bug ?? + ||
    const goalDescription = String(
      body.goalDescription ?? prompt ?? 'Visuel marketing généré par Aurik.'
    );

    if (!agentName) {
      return NextResponse.json(
        { error: 'agentName manquant.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // 1) Brand profile (optionnel)
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
        '[Aurik] Erreur lecture marketing_brand_profiles (generate-image):',
        brandError
      );
    } else if (brandRow?.profile) {
      brandProfile = brandRow.profile as BrandProfile;
    }

    // 2) Appel au Skill Pack marketing pour générer l'image
    const image = await marketingSkillPack.generateMarketingImage({
      agentName,
      brandProfile,
      platform,
      goalType,
      goalDescription,
      prompt,
    });

    // 3) Réponse au frontend
    return NextResponse.json(
      {
        image,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(
      '[Aurik] Erreur inattendue dans /api/marketing/generate-image:',
      err
    );
    return NextResponse.json(
      {
        error:
          err?.message ||
          "Erreur inconnue lors de la génération de l'image marketing.",
      },
      { status: 500 }
    );
  }
}
