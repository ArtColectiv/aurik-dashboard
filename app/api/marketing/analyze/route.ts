import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { agentId, description } = await req.json();

    if (!description) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      );
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    const prompt = `
Tu es un expert marketing
— mélange de Gary Vee (énergie, clarté, punch)
— Harvard Business Review (structure, stratégie, rigueur)

Objectif :
Faire une analyse marketing complète + recommandations actionnables.

Format attendu :
1. Résumé clair
2. Forces actuelles
3. Faiblesses & risques
4. Opportunités à exploiter
5. Stratégie marketing recommandée
6. 5 actions immédiates
7. Ton friendly, expert, motivant

Entreprise décrite :
${description}`;

    const response = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: "Tu es un expert marketing stratégique." },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
    });

    const result =
      response.choices[0]?.message?.content?.trim() ||
      "Impossible de générer l'analyse.";

    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Erreur interne", details: e.message },
      { status: 500 }
    );
  }
}
