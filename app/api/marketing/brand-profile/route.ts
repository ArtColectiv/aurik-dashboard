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
      .from("marketing_brand_profiles")
      .select(
        "primary_color, secondary_color, accent_color, tone, font_style"
      )
      .eq("ecosystem_id", ECOSYSTEM_ID)
      .eq("agent_name", agentName)
      .maybeSingle();

    if (error) {
      console.error("select brand profile error:", error.message);
      return NextResponse.json(
        { ok: false, error: "Erreur lecture DB" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        profile: data,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("GET /brand-profile error:", e?.message || e);
    return NextResponse.json(
      { ok: false, error: "Erreur interne brand-profile GET" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const agentName = body?.agentName as string | undefined;
    const primaryColor = body?.primaryColor as string | undefined;
    const secondaryColor = body?.secondaryColor as string | undefined;
    const accentColor = body?.accentColor as string | undefined;
    const tone = body?.tone as string | undefined;
    const fontStyle = body?.fontStyle as string | undefined;

    if (!agentName) {
      return NextResponse.json(
        { ok: false, error: "agentName requis" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("marketing_brand_profiles")
      .upsert(
        [
          {
            ecosystem_id: ECOSYSTEM_ID,
            agent_name: agentName,
            primary_color: primaryColor,
            secondary_color: secondaryColor,
            accent_color: accentColor,
            tone,
            font_style: fontStyle,
            updated_at: new Date().toISOString(),
          },
        ],
        {
          onConflict: "ecosystem_id,agent_name",
        }
      )
      .select(
        "primary_color, secondary_color, accent_color, tone, font_style"
      )
      .maybeSingle();

    if (error) {
      console.error("upsert brand profile error:", error.message);
      return NextResponse.json(
        { ok: false, error: "Erreur écriture DB" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        profile: data,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("POST /brand-profile error:", e?.message || e);
    return NextResponse.json(
      { ok: false, error: "Erreur interne brand-profile POST" },
      { status: 500 }
    );
  }
}
