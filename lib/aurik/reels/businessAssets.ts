// lib/aurik/reels/businessAssets.ts
import fs from "node:fs/promises";
import path from "node:path";

type SupabaseServerClient = {
  storage: {
    from: (bucket: string) => {
      list: (
        prefix?: string,
        options?: { limit?: number; offset?: number; sortBy?: { column: string; order: "asc" | "desc" } }
      ) => Promise<{ data: Array<{ name: string } | null> | null; error: any }>;
      download: (p: string) => Promise<{ data: Blob | null; error: any }>;
    };
  };
};

export type BusinessAssetsForJob = {
  /** Texte contextuel optionnel (ex: catégories). Ici on garde simple. */
  contextText: string;
  /** Images téléchargées localement dans jobDir */
  imagePaths: string[];
  /** Pour debug */
  source?: {
    bucket: string;
    prefix: string;
    count: number;
  };
};

// ⚠️ On ne connaît pas ton bucket avec certitude.
// On essaie une petite liste de buckets "probables" sans casser l’existant.
const CANDIDATE_BUCKETS = [
  process.env.AURIK_BUSINESS_ASSETS_BUCKET,
  "aurik-assets",
  "marketing-assets",
  "business-assets",
  "marketing-business-assets",
].filter(Boolean) as string[];

// Ton upload renvoie un storagePath qui commence par ceci (prefix dossier)
function buildCandidatePrefixes(agentName: string): string[] {
  // IMPORTANT: ton upload a montré "marketing-business-assets/<agent>/original/..."
  // donc on cible ce chemin en priorité.
  return [
    `marketing-business-assets/${agentName}/original`,
    `marketing-business-assets/${agentName}`,
    `${agentName}/original`,
    `${agentName}`,
  ];
}

function isImageName(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png") || n.endsWith(".webp");
}

async function blobToBuffer(b: Blob): Promise<Buffer> {
  const ab = await b.arrayBuffer();
  return Buffer.from(ab);
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

export async function loadBusinessAssetsForJob(params: {
  supabase: SupabaseServerClient;
  agentName: string;
  jobDir: string;
  maxAssets: number;
}): Promise<BusinessAssetsForJob> {
  const { supabase, agentName, jobDir, maxAssets } = params;

  const outDir = path.join(jobDir, "business-assets");
  await ensureDir(outDir);

  // ✅ comportement safe: si rien trouvé -> retourne vide (non-breaking)
  const empty: BusinessAssetsForJob = { contextText: "", imagePaths: [] };

  // Si aucune config de bucket et aucune valeur probable -> on sort sans casser.
  if (!CANDIDATE_BUCKETS.length) {
    console.warn("[Aurik] businessAssets:no_bucket_candidates", { agentName });
    return empty;
  }

  const prefixes = buildCandidatePrefixes(agentName);

  for (const bucket of CANDIDATE_BUCKETS) {
    for (const prefix of prefixes) {
      try {
        const { data, error } = await supabase.storage.from(bucket).list(prefix, {
          limit: 100,
          offset: 0,
          sortBy: { column: "name", order: "asc" },
        });

        if (error) {
          // bucket/prefix invalide ou pas de droit -> on continue
          continue;
        }

        const names = (data ?? [])
          .map((x) => x?.name)
          .filter((n): n is string => typeof n === "string" && n.length > 0)
          .filter(isImageName);

        if (!names.length) {
          continue;
        }

        const chosen = names.slice(0, Math.max(1, maxAssets));
        const localPaths: string[] = [];

        for (const name of chosen) {
          const storagePath = `${prefix}/${name}`;
          const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath);
          if (dlErr || !blob) continue;

          const buf = await blobToBuffer(blob);
          const ext = path.extname(name) || ".jpg";
          const localPath = path.join(outDir, `${localPaths.length + 1}${ext}`);
          await fs.writeFile(localPath, buf);
          localPaths.push(localPath);
        }

        if (localPaths.length) {
          console.log("[Aurik] businessAssets:loaded", {
            agentName,
            bucket,
            prefix,
            assets: localPaths.length,
          });

          return {
            contextText: "",
            imagePaths: localPaths,
            source: { bucket, prefix, count: localPaths.length },
          };
        }
      } catch {
        // on continue silencieusement (safe)
        continue;
      }
    }
  }

  console.log("[Aurik] businessAssets:none", { agentName });
  return empty;
}
