import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  computeAgentMarketingInsights,
  MarketingFeedbackRow,
  MarketingPublishedContentRow,
  MarketingPlatformMetricsRow,
} from '@/lib/aurik/learning/marketingLearningEngine';

function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      '[Aurik] SUPABASE config manquante pour recompute-agent-metrics.'
    );
    throw new Error('Supabase configuration missing');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

interface RecomputeAgentMetricsBody {
  agentName: string;
}

/**
 * POST /api/marketing/recompute-agent-metrics
 *
 * Body JSON attendu:
 * {
 *   "agentName": "Aurik-Test-Metrics"
 * }
 *
 * Cette route :
 *  - lit les feedbacks, publications et metrics pour cet agent
 *  - calcule les préférences + AurikScore via le Learning Engine
 *  - upsert dans agent_metrics
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RecomputeAgentMetricsBody;

    if (!body.agentName) {
      return NextResponse.json(
        { error: "Paramètre 'agentName' manquant." },
        { status: 400 }
      );
    }

    const agentName = body.agentName;
    const supabase = createSupabaseServerClient();

    // 1) Récupérer l'agent pour connaître son user_id
    const {
      data: agentRow,
      error: agentError,
    } = await supabase
      .from('aurik_agents')
      .select('id, user_id')
      .eq('name', agentName)
      .maybeSingle();

    if (agentError) {
      console.error(
        '[Aurik] Erreur lecture aurik_agents dans recompute-agent-metrics:',
        agentError
      );
      return NextResponse.json(
        { error: "Erreur lors de la lecture de l'agent." },
        { status: 500 }
      );
    }

    if (!agentRow) {
      return NextResponse.json(
        { error: "Agent introuvable pour ce nom." },
        { status: 404 }
      );
    }

    const userId: string = agentRow.user_id;

    // 2) Lire tous les feedbacks pour cet agent + user
    const {
      data: feedbackRows,
      error: feedbackError,
    } = await supabase
      .from('marketing_generation_feedback')
      .select('*')
      .eq('agent_name', agentName)
      .eq('user_id', userId);

    if (feedbackError) {
      console.error(
        '[Aurik] Erreur lecture marketing_generation_feedback:',
        feedbackError
      );
      return NextResponse.json(
        { error: 'Erreur lecture feedback.' },
        { status: 500 }
      );
    }

    // 3) Lire toutes les publications pour cet agent + user
    const {
      data: publishedRows,
      error: publishedError,
    } = await supabase
      .from('marketing_published_content')
      .select('*')
      .eq('agent_name', agentName)
      .eq('user_id', userId);

    if (publishedError) {
      console.error(
        '[Aurik] Erreur lecture marketing_published_content:',
        publishedError
      );
      return NextResponse.json(
        { error: 'Erreur lecture publications.' },
        { status: 500 }
      );
    }

    const publishedIds = (publishedRows ?? []).map((p) => p.id as string);

    // 4) Lire les metrics associées
    let metricsRows: MarketingPlatformMetricsRow[] = [];

    if (publishedIds.length > 0) {
      const {
        data: metricsData,
        error: metricsError,
      } = await supabase
        .from('marketing_platform_metrics')
        .select('*')
        .in('published_content_id', publishedIds);

      if (metricsError) {
        console.error(
          '[Aurik] Erreur lecture marketing_platform_metrics:',
          metricsError
        );
        return NextResponse.json(
          { error: 'Erreur lecture métriques.' },
          { status: 500 }
        );
      }

      metricsRows = (metricsData ?? []) as MarketingPlatformMetricsRow[];
    }

    const feedbackTyped =
      (feedbackRows ?? []) as MarketingFeedbackRow[];
    const publishedTyped =
      (publishedRows ?? []) as MarketingPublishedContentRow[];

    // 5) Calculer les insights via le Learning Engine
    const insights = computeAgentMarketingInsights({
      agentName,
      feedbackRows: feedbackTyped,
      publishedRows: publishedTyped,
      metricsRows,
    });

    // 6) Upsert dans agent_metrics
    const { aurikScore, preferences } = insights;

    const { error: upsertError } = await supabase
      .from('agent_metrics')
      .upsert(
        {
          user_id: userId,
          agent_name: agentName,
          aurik_score: aurikScore.score,
          aurik_score_details: aurikScore.details,
          marketing_preferences: preferences,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,agent_name' }
      );

    if (upsertError) {
      console.error(
        '[Aurik] Erreur upsert agent_metrics:',
        upsertError
      );
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour des metrics agent.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        agentName,
        aurikScore,
        preferences,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(
      '[Aurik] Erreur inattendue dans recompute-agent-metrics:',
      err
    );
    return NextResponse.json(
      { error: 'Erreur interne serveur.' },
      { status: 500 }
    );
  }
}
