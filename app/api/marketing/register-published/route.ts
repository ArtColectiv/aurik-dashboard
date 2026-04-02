import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type ContentType = 'post' | 'reel';
type Platform = 'instagram' | 'tiktok' | 'facebook' | 'linkedin';

interface RegisterPublishedRequestBody {
  agentName: string;
  contentType: ContentType;
  platform: Platform;

  /**
   * Optionnel: lien vers une ligne de marketing_generation_feedback
   * si ce contenu provient directement d'une génération Aurik.
   */
  feedbackId?: string | null;

  /**
   * Identifiant du post sur la plateforme (ID, shortcode, etc.)
   */
  platformPostId: string;

  /**
   * URL publique du post (si disponible)
   */
  platformPostUrl?: string | null;

  /**
   * Date/heure de publication (si connue). Format ISO string.
   * Si non fourni, on laissera Supabase gérer ou on estimera à now().
   */
  publishedAt?: string | null;

  /**
   * Notes libres (ex: "boosté en pub", "test A/B", etc.)
   */
  notes?: string | null;
}

// Client Supabase côté serveur avec service role
function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      '[Aurik] SUPABASE URL ou SERVICE ROLE KEY manquant pour register-published.'
    );
    throw new Error('Supabase configuration missing');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return supabase;
}

/**
 * POST /api/marketing/register-published
 *
 * Exemple de body:
 * {
 *   "agentName": "Aurik-Test-Metrics",
 *   "contentType": "post",
 *   "platform": "instagram",
 *   "feedbackId": "uuid-de-feedback-ou-null",
 *   "platformPostId": "1234567890",
 *   "platformPostUrl": "https://instagram.com/p/xxxxx",
 *   "publishedAt": "2025-12-03T17:45:00.000Z",
 *   "notes": "Publié en organique, pas de pub."
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RegisterPublishedRequestBody;

    const supabase = createSupabaseServerClient();

    const {
      agentName,
      contentType,
      platform,
      feedbackId,
      platformPostId,
      platformPostUrl,
      publishedAt,
      notes,
    } = body;

    // Validation minimale des champs obligatoires
    if (!agentName || !contentType || !platform || !platformPostId) {
      return NextResponse.json(
        {
          error:
            "Champs obligatoires manquants: 'agentName', 'contentType', 'platform', 'platformPostId'.",
        },
        { status: 400 }
      );
    }

    // Vérifier l'utilisateur courant (Supabase Auth)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error(
        '[Aurik] Erreur getUser dans register-published:',
        userError
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Utilisateur non authentifié.' },
        { status: 401 }
      );
    }

    const publishedAtValue = publishedAt
      ? new Date(publishedAt)
      : null;

    const { error: insertError } = await supabase
      .from('marketing_published_content')
      .insert({
        user_id: user.id,
        agent_name: agentName,
        content_type: contentType,
        platform,
        feedback_id: feedbackId ?? null,
        platform_post_id: platformPostId,
        platform_post_url: platformPostUrl ?? null,
        published_at: publishedAtValue,
        notes: notes ?? null,
      });

    if (insertError) {
      console.error(
        '[Aurik] Erreur insertion marketing_published_content:',
        insertError
      );
      return NextResponse.json(
        { error: 'Impossible denregistrer la publication.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(
      '[Aurik] Erreur inattendue dans /api/marketing/register-published:',
      err
    );
    return NextResponse.json(
      { error: 'Erreur interne serveur.' },
      { status: 500 }
    );
  }
}
