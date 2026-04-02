import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// ✅ ton bucket existant
const BUCKET = "aurik-reel-scene";

function contentTypeFromPath(p: string) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

export async function uploadSceneImageAndGetPublicUrl(params: {
  agentName: string;
  jobId: string;
  sceneIndex: number; // 0-based
  localImagePath: string;
}): Promise<{ storagePath: string; publicUrl: string }> {
  const supabase = createSupabaseServerClient();

  const buf = await fs.readFile(params.localImagePath);
  const ext = path.extname(params.localImagePath) || ".png";

  const storagePath = `v1/${params.agentName}/${params.jobId}/scene-${params.sceneIndex + 1}${ext}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: contentTypeFromPath(params.localImagePath),
    upsert: true,
  });

  if (upErr) {
    throw new Error(`scene upload failed: ${upErr.message ?? String(upErr)}`);
  }

  // IMPORTANT: ça marche seulement si ton bucket est PUBLIC
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = data?.publicUrl;

  if (!publicUrl) {
    throw new Error("scene getPublicUrl failed (bucket likely not public)");
  }

  return { storagePath, publicUrl };
}
