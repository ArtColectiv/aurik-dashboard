import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const businessDescription = body?.businessDescription ?? "";
    const mainGoal = body?.mainGoal ?? "";

    if (!businessDescription) {
      return NextResponse.json(
        { error: "businessDescription manquant" },
        { status: 400 }
      );
    }

    const prompt = `
Tu es un expert en stratégie marketing 360° pour petites entreprises.
Style : expert mais friendly, clair, actionnable (Gary Vee x Harvard Business Review).

À partir des infos suivantes :

- Business : ${businessDescription}
- Objectif principal : ${mainGoal || "non précisé"}

Génère une STRATÉGIE MARKETING 360° structurée avec ces sections :

1. Résumé rapide (3-4 phrases max)
2. Positionnement & promesse de valeur
3. Audience cible (profil + besoins)
4. Messages clés (3 à 5 messages)
5. Canaux recommandés (Instagram, TikTok, email, pub, etc.)
6. Plan d'action 30 jours (structuré par semaine)
7. 10 actions concrètes à faire dès maintenant

Format : texte clair, structuré, avec titres et listes à puces.
Langue : Français uniquement.
    `.trim();

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.5,
      messages: [
        { role: "system", content: "Tu es un consultant en stratégie marketing 360°." },
        { role: "user", content: prompt },
      ],
    });

    const strategy =
      response.choices[0]?.message?.content?.trim() ||
      "Impossible de générer une stratégie pour le moment.";

    return NextResponse.json(
      {
        ok: true,
        strategy,
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: "Erreur interne dans /api/marketing/strategy" },
      { status: 500 }
    );
  }
}
