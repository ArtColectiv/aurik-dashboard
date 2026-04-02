import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

const ECOSYSTEM_ID = "default";

export async function POST(req: NextRequest) {
  try {
    const { agentName, skillPackId } = await req.json();

    if (!agentName || !skillPackId) {
      return NextResponse.json(
        { error: "agentName et skillPackId sont requis" },
        { status: 400 }
      );
    }

    // 1. Vérifier que ce pack est bien installé sur cet agent
    const { data: installed, error: installedError } = await supabase
      .from("agent_installed_skill_packs")
      .select("id")
      .eq("ecosystem_id", ECOSYSTEM_ID)
      .eq("agent_name", agentName)
      .eq("skill_pack_id", skillPackId)
      .maybeSingle();

    if (installedError) {
      console.error("uninstall-skill-pack → installedError:", installedError);
      return NextResponse.json(
        { error: "Erreur lors de la vérification du Skill Pack installé." },
        { status: 500 }
      );
    }

    if (!installed) {
      return NextResponse.json(
        { error: "Ce Skill Pack n'est pas installé sur cet agent." },
        { status: 404 }
      );
    }

    // 2. Supprimer les shortcuts provenant de ce Skill Pack pour cet agent
    const { error: shortcutsError } = await supabase
      .from("agent_shortcuts")
      .delete()
      .eq("ecosystem_id", ECOSYSTEM_ID)
      .eq("agent_name", agentName)
      .eq("skill_pack_id", skillPackId);

    if (shortcutsError) {
      console.error("uninstall-skill-pack → shortcutsError:", shortcutsError);
      return NextResponse.json(
        {
          error: "Erreur lors de la suppression des shortcuts du Skill Pack.",
          details: shortcutsError.message ?? String(shortcutsError),
        },
        { status: 500 }
      );
    }

    // 3. Supprimer l'entrée dans agent_installed_skill_packs
    const { error: uninstallError } = await supabase
      .from("agent_installed_skill_packs")
      .delete()
      .eq("ecosystem_id", ECOSYSTEM_ID)
      .eq("agent_name", agentName)
      .eq("skill_pack_id", skillPackId);

    if (uninstallError) {
      console.error("uninstall-skill-pack → uninstallError:", uninstallError);
      return NextResponse.json(
        {
          error: "Erreur lors de la suppression de l'installation du Skill Pack.",
          details: uninstallError.message ?? String(uninstallError),
        },
        { status: 500 }
      );
    }

    // 4. Réponse finale
    return NextResponse.json(
      {
        success: true,
        message: `Skill Pack désinstallé de l'agent "${agentName}".`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("uninstall-skill-pack → unexpected error:", error);
    return NextResponse.json(
      { error: "Erreur interne dans uninstall-skill-pack." },
      { status: 500 }
    );
  }
}
