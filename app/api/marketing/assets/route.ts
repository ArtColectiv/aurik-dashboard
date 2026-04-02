import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

const ECOSYSTEM_ID = "default";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentName = searchParams.get("agentName");

    if (!agentName) {
      return NextResponse.json(
        { ok: false, error: "agentName requis" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("marketing_assets")
      .select("id, public_url, storage_path, created_at, type")
      .eq("ecosystem_id", ECOSYSTEM_ID)
      .eq("agent_name", agentName)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("select marketing_assets error:", error.message);
      return NextResponse.json(
        { ok: false, error: "Erreur lecture DB" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        assets: data ?? [],
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("Erreur /api/marketing/assets:", e?.message || e);
    return NextResponse.json(
      { ok: false, error: "Erreur interne assets" },
      { status: 500 }
    );
  }
}
