import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabaseClient";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Route API appelée par l'UI pour créer automatiquement un nouvel agent Aurik.
 * URL: POST /api/spawn-agent
 * Body JSON: { "prompt": "description de l'agent que tu veux" }
 */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY manquant dans .env.local" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Champ 'prompt' manquant ou invalide" },
        { status: 400 }
      );
    }

    // (1) Consigne pour Aurik-Builder (version serveur)
    const system = `
Tu es Aurik-Builder, architecte d'agents Aurik.
Ta mission: concevoir un NOUVEL AGENT Aurik à partir de la description fournie.
Tu dois répondre STRICTEMENT au format JSON, sans texte autour.

Format EXACT:

{
  "name": "Nom-de-l-agent-sans-espace-avec-des-tirets",
  "role": "Une phrase claire qui décrit le rôle de l'agent dans le système Aurik.",
  "style": "Une phrase qui décrit son style de réponse (ton, attitude, manière de parler)."
}

Contraintes:
- 'name' doit être unique, lisible, avec des tirets à la place des espaces (ex: "Aurik-Tiktok-Performance").
- Pas de markdown, pas de texte avant/après, uniquement du JSON valide.
`;

    const user = `Voici le besoin humain pour le nouvel agent: "${prompt}"`;

    // (2) Appel OpenAI pour générer la config d'agent
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    const raw =
      completion.choices[0]?.message?.content?.trim() ?? "";

    // (3) Extraction du JSON dans la réponse
    let parsed: any;
    try {
      const firstBrace = raw.indexOf("{");
      const lastBrace = raw.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error("Aucun bloc JSON détecté dans la réponse du modèle.");
      }
      const jsonSlice = raw.slice(firstBrace, lastBrace + 1);
      parsed = JSON.parse(jsonSlice);
    } catch (e: any) {
      console.error("❌ Parsing JSON spawn-agent:", e?.message || e);
      return NextResponse.json(
        {
          error: "Impossible de parser la réponse de l'IA en JSON.",
          raw
        },
        { status: 500 }
      );
    }

    if (!parsed.name || !parsed.role || !parsed.style) {
      return NextResponse.json(
        {
          error:
            "JSON incomplet (il faut name, role, style).",
          parsed
        },
        { status: 500 }
      );
    }

    // (4) Normalisation des champs
    const name = String(parsed.name)
      .trim()
      .replace(/\s+/g, "-"); // on remplace les espaces par des tirets
    const role = String(parsed.role).trim();
    const style = String(parsed.style).trim();

    // (5) Écriture dans aurik_agents
    const { error: insertAgentError } = await supabase
      .from("aurik_agents")
      .insert([
        {
          agent_name: name,
          role,
          style
        }
      ]);

    if (insertAgentError && insertAgentError.code !== "23505") {
      console.error(
        "❌ insert aurik_agents error:",
        insertAgentError.message
      );
      return NextResponse.json(
        { error: insertAgentError.message },
        { status: 500 }
      );
    }

    // (6) Upsert dans agent_metrics
    const { error: metricsError } = await supabase
      .from("agent_metrics")
      .upsert(
        {
          agent_name: name,
          tasks_count: 0,
          total_output_length: 0,
          avg_output_length: 0,
          aurik_score: 0,
          last_activity: null
        },
        {
          onConflict: "agent_name"
        }
      );

    if (metricsError) {
      console.error(
        "❌ upsert agent_metrics error:",
        metricsError.message
      );
      // on ne bloque pas totalement, mais on le signale
    }

    // (7) Réponse pour l'UI
    return NextResponse.json(
      {
        name,
        role,
        style,
        raw
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("❌ spawn-agent route error:", e?.message || e);
    return NextResponse.json(
      { error: "Erreur interne dans /api/spawn-agent" },
      { status: 500 }
    );
  }
}
