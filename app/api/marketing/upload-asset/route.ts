import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

const ECOSYSTEM_ID = "default";
const BUCKET_NAME = "marketing-assets";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("file");
    const agentName = formData.get("agentName");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Aucun fichier reçu." },
        { status: 400 }
      );
    }

    if (typeof agentName !== "string" || !agentName.trim()) {
      return NextResponse.json(
        { ok: false, error: "agentName manquant." },
        { status: 400 }
      );
    }

    const safeAgentName = agentName.trim();
    const ext = file.name.split(".").pop() || "bin";
    const timestamp = Date.now();
    const filePath = `${ECOSYSTEM_ID}/${safeAgentName}/${timestamp}-${file.name}`;

    // Convertir le File en Buffer pour Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data: uploadResult, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      console.error("[Aurik][UploadAsset] Supabase upload error:", uploadError);
      return NextResponse.json(
        {
          ok: false,
          error: "Erreur lors de l'upload dans Supabase Storage.",
          details: uploadError.message,
        },
        { status: 500 }
      );
    }

    // Récupérer l'URL publique
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;

    // Insérer une ligne dans marketing_assets
    const { data: inserted, error: dbError } = await supabase
      .from("marketing_assets")
      .insert({
        ecosystem_id: ECOSYSTEM_ID,
        agent_name: safeAgentName,
        file_path: filePath,
        public_url: publicUrl,
      })
      .select()
      .single();

    if (dbError) {
      console.error("[Aurik][UploadAsset] DB insert error:", dbError);
      return NextResponse.json(
        {
          ok: false,
          error: "Erreur lors de l'enregistrement en base (marketing_assets).",
          details: dbError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        asset: inserted,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[Aurik][UploadAsset] Unexpected error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: "Erreur interne dans /api/marketing/upload-asset.",
        details: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
