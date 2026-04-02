import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

const ECOSYSTEM_ID = "default";

export async function POST(req: NextRequest) {
  try {
    const { agentName, skillPackId, installedBy } = await req.json();

    if (!agentName || !skillPackId) {
      return NextResponse.json(
        { error: "agentName et skillPackId sont requis" },
        { status: 400 }
      );
    }

    // 1. Vérifier que le Skill Pack existe
    const { data: pack, error: packError } = await supabase
      .from("skill_packs")
      .select("*")
      .eq("id", skillPackId)
      .eq("ecosystem_id", ECOSYSTEM_ID)
      .maybeSingle();

    if (packError || !pack) {
      console.error("install-skill-pack → packError:", packError);
      return NextResponse.json(
        { error: "Skill Pack introuvable" },
        { status: 404 }
      );
    }

    // 2. Vérifier que le pack n'est pas déjà installé sur cet agent
    const { data: alreadyInstalled, error: alreadyError } = await supabase
      .from("agent_installed_skill_packs")
      .select("id")
      .eq("ecosystem_id", ECOSYSTEM_ID)
      .eq("agent_name", agentName)
      .eq("skill_pack_id", skillPackId)
      .maybeSingle();

    if (alreadyError) {
      console.error("install-skill-pack → alreadyError:", alreadyError);
    }

    if (alreadyInstalled) {
      return NextResponse.json(
        { error: "Skill Pack déjà installé sur cet agent" },
        { status: 409 }
      );
    }

    // 3. Récupérer les shortcuts du Skill Pack
    const { data: packShortcuts, error: shortcutError } = await supabase
      .from("skill_pack_shortcuts")
      .select("*")
      .eq("ecosystem_id", ECOSYSTEM_ID)
      .eq("skill_pack_id", skillPackId)
      .order("sort_order", { ascending: true });

    if (shortcutError) {
      console.error("install-skill-pack → shortcutError:", shortcutError);
      return NextResponse.json(
        { error: "Impossible de lire les shortcuts du pack" },
        { status: 500 }
      );
    }

    if (!packShortcuts || packShortcuts.length === 0) {
      return NextResponse.json(
        { error: "Ce Skill Pack ne contient aucun shortcut." },
        { status: 400 }
      );
    }

    // 4. Copier les shortcuts dans agent_shortcuts
    const shortcutsToInsert = packShortcuts.map((sc: any) => ({
      ecosystem_id: ECOSYSTEM_ID,
      agent_name: agentName,
      label: sc.label,
      prompt: sc.prompt,
      // IMPORTANT : ta table agent_shortcuts utilise order_index (et pas sort_order)
      order_index: sc.sort_order ?? 0,
      skill_pack_id: skillPackId,
    }));

    const { error: insertError } = await supabase
      .from("agent_shortcuts")
      .insert(shortcutsToInsert);

    if (insertError) {
      console.error("install-skill-pack → insertError:", insertError);
      return NextResponse.json(
        {
          error: "Erreur lors de la création des shortcuts",
          details: insertError.message ?? String(insertError),
        },
        { status: 500 }
      );
    }

    // 5. Enregistrer l'installation du pack
    const { error: installError } = await supabase
      .from("agent_installed_skill_packs")
      .insert([
        {
          ecosystem_id: ECOSYSTEM_ID,
          agent_name: agentName,
          skill_pack_id: skillPackId,
          installed_by: installedBy ?? null,
        },
      ]);

    if (installError) {
      console.error("install-skill-pack → installError:", installError);
      return NextResponse.json(
        { error: "Erreur lors de l'enregistrement de l'installation" },
        { status: 500 }
      );
    }

    // 6. Réponse finale
    return NextResponse.json(
      {
        success: true,
        message: `Skill Pack "${pack.name}" installé sur l'agent "${agentName}".`,
        shortcuts_created: shortcutsToInsert.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("install-skill-pack → unexpected error:", error);
    return NextResponse.json(
      { error: "Erreur interne dans install-skill-pack" },
      { status: 500 }
    );
  }
}
