import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

const ECOSYSTEM_ID = "default";

export async function GET(_req: NextRequest) {
  try {
    const { data, error } = await supabase
      .from("skill_packs")
      .select(
        `
        id,
        ecosystem_id,
        name,
        slug,
        description,
        category,
        version,
        tags,
        is_public,
        role,
        style,
        instructions
      `
      )
      .eq("ecosystem_id", ECOSYSTEM_ID)
      .order("name", { ascending: true });

    if (error) {
      console.error("/api/skill-packs → error:", error);
      return NextResponse.json(
        { error: "Erreur lors de la récupération des Skill Packs." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        skillPacks: data ?? [],
      },
      { status: 200 }
    );
  } catch (e) {
    console.error("/api/skill-packs → unexpected error:", e);
    return NextResponse.json(
      { error: "Erreur interne dans /api/skill-packs." },
      { status: 500 }
    );
  }
}
