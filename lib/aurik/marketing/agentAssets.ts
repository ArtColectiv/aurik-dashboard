// lib/aurik/marketing/agentAssets.ts
import fs from "node:fs/promises";
import path from "node:path";

type SupabaseLike = {
  storage: {
    from: (bucket: string) => {
      list: (prefix?: string, options?: any) => Promise<{ data: any[] | null; error: any | null }>;
      download: (filePath: string) => Promise<{ data: any; error: any | null }>;
    };
  };
};

export async function loadAgentAssetImagesForJob(params: {
  supabase: SupabaseLike;
  agentName: string;
  jobDir: string;
  maxAssets: number;
}): Promise<{ localPaths: string[]; source: { bucket: string; prefix: string } | null }> {
  const { supabase, agentName, jobDir, maxAssets } = params;

  // Where we save downloaded assets locally for the job
  const outDir = path.join(jobDir, "business-assets");
  await fs.mkdir(outDir, { recursive: true });

  // We don't know your exact bucket name from here.
  // But we DO know the prefix shape from upload response:
  // "marketing-business-assets/<agentName>/original/<file>.jpeg"
  //
  // So we try a few common buckets and a few prefix variants.
  const bucketCandidates = [
    "marketing-business-assets",
    "aurik-business-assets",
    "business-assets",
    "public",
    "assets",
  ];

  const prefixCandidates = [
    // Most likely if bucket is separate:
    `${agentName}/original`,
    `${agentName}`,

    // If the upload route stored under a folder named "marketing-business-assets" inside a bucket:
    `marketing-business-assets/${agentName}/original`,
    `marketing-business-assets/${agentName}`,
  ];

  for (const bucket of bucketCandidates) {
    for (const prefix of prefixCandidates) {
      try {
        const { data, error } = await supabase.storage.from(bucket).list(prefix, {
          limit: 100,
          offset: 0,
        });

        if (error || !data || data.length === 0) continue;

        // Keep only image-like files
        const files = data
          .filter((x: any) => typeof x?.name === "string")
          .filter((x: any) => {
            const n = String(x.name).toLowerCase();
            return n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png") || n.endsWith(".webp");
          })
          .slice(0, maxAssets);

        if (files.length === 0) continue;

        const localPaths: string[] = [];

        for (const f of files) {
          const remotePath = prefix ? `${prefix}/${f.name}` : f.name;
          const { data: fileData, error: dlErr } = await supabase.storage.from(bucket).download(remotePath);
          if (dlErr || !fileData) continue;

          const arrayBuf = await fileData.arrayBuffer();
          const localPath = path.join(outDir, f.name);
          await fs.writeFile(localPath, Buffer.from(arrayBuf));

          localPaths.push(localPath);
          if (localPaths.length >= maxAssets) break;
        }

        if (localPaths.length > 0) {
          return { localPaths, source: { bucket, prefix } };
        }
      } catch {
        // ignore and try next
      }
    }
  }

  return { localPaths: [], source: null };
}
