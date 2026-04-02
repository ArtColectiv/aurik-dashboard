import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { DB } from "@/lib/aurik/db";

export async function GET() {
  try {
    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from(DB.AGENTS_TABLE)
      .select("id, agent_name")
      .order("agent_name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, details: error.details ?? null },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, agents: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Erreur inconnue" },
      { status: 500 }
    );
  }
}