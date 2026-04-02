import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { DB } from "@/lib/aurik/db";

type HistoryPost = {
  id: string;
  created_at: string;
  post_type: string;
  prompt_subject: string | null;
  content_hook: string | null;
  content_caption: string | null;
  content_cta: string | null;
  content_hashtags: string[] | null;
  visual_mode: string | null;
  visual_prompt: string | null;
  visual_alt: string | null;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const agentId = (url.searchParams.get("agentId") || "").trim() || null;
    const agentNameParam = (url.searchParams.get("agentName") || "").trim() || null;

    const supabase = supabaseServer();

    // 1) Déterminer l'agent_name (source de vérité pour les tables marketing_* chez toi)
    let agentName: string | null = agentNameParam;

    if (!agentName && agentId) {
      const { data: agentRow, error: agentErr } = await supabase
        .from(DB.AGENTS_TABLE)
        .select("agent_name")
        .eq("id", agentId)
        .maybeSingle();

      if (agentErr) {
        return NextResponse.json(
          { ok: false, error: agentErr.message, details: agentErr.details ?? null },
          { status: 500 }
        );
      }

      agentName = agentRow?.agent_name ?? null;
    }

    if (!agentName) {
      // compat avec ton UI + debug clair
      return NextResponse.json({ ok: false, error: "agentName manquant." }, { status: 400 });
    }

    // 2) Charger l'historique des posts
    // NOTE: table réelle dans ta DB = "marketing_generated_posts"
    const { data: posts, error } = await supabase
      .from("marketing_generated_posts")
      .select(
        "id, created_at, post_type, prompt_subject, content_hook, content_caption, content_cta, content_hashtags, visual_mode, visual_prompt, visual_alt"
      )
      .eq("agent_name", agentName)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, details: error.details ?? null },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, posts: (posts ?? []) as HistoryPost[] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Erreur inconnue" },
      { status: 500 }
    );
  }
}