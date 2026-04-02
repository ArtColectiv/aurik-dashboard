import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface FeedbackRequestBody {
  agentName: string;
  contentType: 'post' | 'reel';
  platform: 'instagram' | 'tiktok' | 'facebook' | 'linkedin';

  goalDescription: string;

  brandProfile?: any;

  caption?: string;
  hook?: string;
  callToAction?: string;
  hashtags?: string[];

  imageUrl?: string;
  imageStoragePath?: string;

  feedbackType: 'accepted' | 'modified' | 'rejected' | 'regenerated';

  modelQualityScore?: number;
  userRating?: number;
  notes?: string;
}

// Create a Supabase client using the service role
function createSupabaseServerClient() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // IMPORTANT : service role key ici
    { auth: { persistSession: false } }
  );
  return supabase;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as FeedbackRequestBody;

    const supabase = createSupabaseServerClient();

    const {
      agentName,
      contentType,
      platform,
      goalDescription,
      brandProfile,
      caption,
      hook,
      callToAction,
      hashtags,
      imageUrl,
      imageStoragePath,
      feedbackType,
      modelQualityScore,
      userRating,
      notes,
    } = body;

    // Vérification des champs obligatoires
    if (!agentName || !contentType || !platform || !goalDescription || !feedbackType) {
      return NextResponse.json(
        { error: 'Missing required fields.' },
        { status: 400 }
      );
    }

    // Récupérer l’utilisateur courant via NextAuth ou Supabase Auth
    // Ici, nous supposons que Supabase Auth est utilisée :
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'User not authenticated.' },
        { status: 401 }
      );
    }

    // Insérer le feedback dans la table
    const { error } = await supabase
      .from('marketing_generation_feedback')
      .insert({
        user_id: user.id,
        agent_name: agentName,
        content_type: contentType,
        platform,
        goal_description: goalDescription,
        brand_profile: brandProfile ?? null,
        caption,
        hook,
        call_to_action: callToAction,
        hashtags,
        image_url: imageUrl,
        image_storage_path: imageStoragePath,
        feedback_type: feedbackType,
        model_quality_score: modelQualityScore ?? null,
        user_rating: userRating ?? null,
        notes: notes ?? null,
      });

    if (error) {
      console.error('[Aurik] Error inserting feedback:', error);
      return NextResponse.json(
        { error: 'Failed to insert feedback.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error('[Aurik] Unexpected error in /marketing/feedback:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
