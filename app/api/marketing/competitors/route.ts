import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const business = body?.business ?? "";
    const competitors = body?.competitors ?? [];
    const market = body?.market ?? "";

    if (!business || competitors.length === 0) {
      return NextResponse.json(
        { error: "Champs requis manquants (business, competitors)" },
        { status: 400 }
      );
    }

    const prompt = `
Tu es un expert marketing et analyste stratégique.
Ton style : expert mais friendly, clair, actionnable (Gary Vee meets Harvard Business Review).

Analyse pour : ${business}
Marché : ${market}
Compétiteurs : ${competitors.join(", ")}

FORME ATTENDUE (JSON STRICT) :

{
  "strengths": [],
  "weaknesses": [],
  "opportunities": [],
  "actionPlan": []
}

Maximum 5 points par catégorie.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.4,
      messages: [
        { role: "system", content: "Tu renvoies STRICTEMENT du JSON valide." },
        { role: "user", content: prompt },
      ],
    });

    let raw = response.choices[0]?.message?.content ?? "{}";

    let json;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: "JSON invalide renvoyé par le modèle." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, analysis: json },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: "Erreur interne dans /api/marketing/competitors" },
      { status: 500 }
    );
  }
}
