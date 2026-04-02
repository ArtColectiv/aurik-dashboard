// lib/aurik/reels/storage.ts

import { supabaseServer } from "@/lib/aurik/supabaseServer";

export async function uploadReelVideoAndGetPublicUrl(args: {
  agentName: string;
  filename: string;
  fileBuffer: Buffer;
}): Promise<{ storagePath: string; publicUrl: string }> {
  const supabase = supabaseServer();
  const storagePath = `agents/${args.agentName}/reels/${args.filename}`;

  const up = await supabase.storage
    .from("marketing-videos")
    .upload(storagePath, args.fileBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (up.error) {
    console.error("[Aurik] reels/storage: upload error", {
      message: up.error.message,
      storagePath,
    });
    throw new Error("Upload failed");
  }

  const { data } = supabase.storage
    .from("marketing-videos")
    .getPublicUrl(storagePath);

  if (!data?.publicUrl) {
    console.error("[Aurik] reels/storage: missing publicUrl", {
      storagePath,
    });
    throw new Error("Public URL missing");
  }

  return {
    storagePath,
    publicUrl: data.publicUrl,
  };
}