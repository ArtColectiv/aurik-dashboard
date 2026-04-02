import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const business = body?.businessDescription ?? "";

    if (!business) {
      return NextResponse.json(
        { error: "businessDescription manquant" },
        { status: 400 }
      );
    }

    const prompt = `
Tu es un expert en stratégie marketing.
Tu dois créer un calendrier de contenu sur 30 jours pour : ${business}

Ton style : expert mais friendly, clair, actionnable, entre Gary Vee et Harvard Business Review.

FORMAT DE SORTIE (IMPORTANT):
Renvoie STRICTEMENT du JSON valide, sous la forme:

{
  "calendar": [
    {
      "day": 1,
      "theme": "",
      "format": "",
      "description": "",
      "cta": ""
    }
  ]
}

Commence maintenant.
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
        {
          ok: false,
          error: "Le modèle a renvoyé un JSON invalide.",
          raw,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        calendar: json.calendar ?? [],
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: "Erreur interne dans /api/marketing/calendar" },
      { status: 500 }
    );
  }
}
