import { createClient } from "@supabase/supabase-js";
import { InstallSkillPackOnAgentButton } from "../InstallSkillPackOnAgentButton";

const ECOSYSTEM_ID = "default";

type SkillPackPageParams = {
  slug?: string;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "[Aurik] Missing env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });
}

export default async function SkillPackDetailPage({
  params,
}: {
  params: SkillPackPageParams;
}) {
  const slug = decodeURIComponent(params.slug ?? "").trim();

  if (!slug) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="bg-slate-900/80 border border-slate-800 px-8 py-6 rounded-2xl shadow-xl max-w-lg w-full">
          <h1 className="text-xl font-semibold mb-2">Skill Pack introuvable</h1>
          <p className="text-sm text-slate-400">
            Aucun slug n&apos;a été fourni dans l&apos;URL.
          </p>
          <a
            href="/skill-packs"
            className="mt-4 inline-block text-xs text-emerald-400 hover:text-emerald-300 underline"
          >
            ← Retour à la liste des Skill Packs
          </a>
        </div>
      </div>
    );
  }

  const supabase = createSupabaseServerClient();

  // 1) On récupère le Skill Pack
  const { data: pack, error: packError } = await supabase
    .from("skill_packs")
    .select(
      `
      id,
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
    .eq("slug", slug)
    .maybeSingle();

  if (packError || !pack) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="bg-slate-900/80 border border-slate-800 px-8 py-6 rounded-2xl shadow-xl max-w-lg w-full">
          <h1 className="text-xl font-semibold mb-2">Skill Pack introuvable</h1>
          <p className="text-sm text-slate-400 mb-4">
            Aucun Skill Pack avec le slug&nbsp;
            <code className="font-mono text-xs bg-slate-900 px-1 py-[1px] rounded">
              {slug}
            </code>{" "}
            n&apos;a été trouvé dans cet écosystème.
          </p>
          <a
            href="/skill-packs"
            className="text-xs text-emerald-400 hover:text-emerald-300 underline"
          >
            ← Retour à la liste des Skill Packs
          </a>
        </div>
      </div>
    );
  }

  // 2) On récupère les shortcuts du pack
  const { data: shortcuts } = await supabase
    .from("skill_pack_shortcuts")
    .select("id, label, prompt, sort_order")
    .eq("ecosystem_id", ECOSYSTEM_ID)
    .eq("skill_pack_id", pack.id)
    .order("sort_order", { ascending: true });

  // 3) On récupère les agents qui ont installé ce pack
  const { data: installedAgents } = await supabase
    .from("agent_installed_skill_packs")
    .select("agent_name, installed_at")
    .eq("ecosystem_id", ECOSYSTEM_ID)
    .eq("skill_pack_id", pack.id)
    .order("installed_at", { ascending: false });

  const shortcutsList = shortcuts ?? [];
  const installedList = installedAgents ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* HEADER */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500 uppercase tracking-[0.18em]">
              Skill Pack Aurik
            </p>
            <h1 className="text-xl font-semibold tracking-tight">
              {pack.name}{" "}
              {pack.version && (
                <span className="text-slate-500">({pack.version})</span>
              )}
            </h1>
            <p className="text-[11px] text-slate-500 mt-1">
              slug :{" "}
              <span className="font-mono text-xs bg-slate-900 px-1 py-[1px] rounded">
                {pack.slug}
              </span>
            </p>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-[2px] text-[10px] uppercase tracking-[0.16em] text-slate-300">
              {pack.is_public ? "Public" : "Privé"}
            </span>
            {pack.category && (
              <p className="text-[11px] text-slate-500 mt-1">
                Catégorie :{" "}
                <span className="font-semibold text-slate-300">
                  {pack.category}
                </span>
              </p>
            )}
          </div>
        </div>
      </header>

      {/* CONTENU */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between mb-2">
          <a
            href="/skill-packs"
            className="text-[11px] text-slate-500 hover:text-emerald-400 underline"
          >
            ← Retour à la bibliothèque
          </a>
        </div>

        {/* Description + rôle / style */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">
              Description
            </h2>
            <p className="text-xs text-slate-200">
              {pack.description || "Aucune description fournie pour ce pack."}
            </p>
            {pack.tags && pack.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {pack.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="px-2 py-[2px] rounded-full bg-slate-800 text-[10px] text-slate-300"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">
              Rôle & style
            </h2>
            <div className="space-y-2 text-xs text-slate-200">
              <p>
                <span className="font-semibold text-slate-300">Rôle :</span>{" "}
                {pack.role || "Non spécifié."}
              </p>
              <p>
                <span className="font-semibold text-slate-300">Style :</span>{" "}
                {pack.style || "Non spécifié."}
              </p>
            </div>
          </div>
        </section>

        {/* Installation rapide sur un agent */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">
            Installer ce Skill Pack sur un agent
          </h2>
          <p className="text-xs text-slate-300 mb-2">
            Entre le nom exact d&apos;un agent Aurik pour lui installer ce Skill
            Pack. Tu peux ensuite voir le résultat dans la fiche de l&apos;agent.
          </p>
          <InstallSkillPackOnAgentButton skillPackId={pack.id} />
        </section>

        {/* Instructions système */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">
            Instructions système du Skill Pack
          </h2>
          <pre className="text-[11px] text-slate-200 bg-slate-950/70 border border-slate-800 rounded-xl p-3 whitespace-pre-wrap">
            {pack.instructions ||
              "Aucune instruction spécifique définie pour ce Skill Pack."}
          </pre>
        </section>

        {/* Shortcuts définis par ce pack */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Shortcuts fournis par ce Skill Pack
            </h2>
            <span className="text-[11px] text-slate-500">
              {shortcutsList.length} shortcut{shortcutsList.length > 1 ? "s" : ""}
            </span>
          </div>

          {shortcutsList.length === 0 && (
            <p className="text-xs text-slate-400">
              Ce Skill Pack ne définit actuellement aucun shortcut dans{" "}
              <code className="font-mono">skill_pack_shortcuts</code>.
            </p>
          )}

          {shortcutsList.length > 0 && (
            <ul className="space-y-3">
              {shortcutsList.map((sc: any) => (
                <li
                  key={sc.id}
                  className="border border-slate-800 rounded-xl p-3 bg-slate-950/60"
                >
                  <p className="text-xs font-semibold text-slate-100">{sc.label}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Ordre : {sc.sort_order ?? 0}
                  </p>
                  <p className="text-[11px] text-slate-300 mt-2 whitespace-pre-wrap">
                    {sc.prompt}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Agents qui utilisent ce pack */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Agents ayant installé ce Skill Pack
            </h2>
            <span className="text-[11px] text-slate-500">
              {installedList.length} agent{installedList.length > 1 ? "s" : ""}
            </span>
          </div>

          {installedList.length === 0 && (
            <p className="text-xs text-slate-400">
              Aucun agent n&apos;a encore installé ce Skill Pack dans cet
              écosystème.
            </p>
          )}

          {installedList.length > 0 && (
            <ul className="space-y-2 text-xs text-slate-300">
              {installedList.map((row: any) => (
                <li
                  key={`${row.agent_name}-${row.installed_at}`}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-100">{row.agent_name}</p>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Installé le{" "}
                    <span className="text-slate-300">
                      {formatDateTime(row.installed_at ?? null)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
