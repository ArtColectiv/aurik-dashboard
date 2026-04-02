import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export const runtime = "nodejs";

function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const agentName = String(form.get("agentName") ?? "").trim();
    const kind = String(form.get("kind") ?? "other").trim();
    const file = form.get("file") as File | null;

    if (!agentName || !file) {
      return NextResponse.json({ ok: false, error: "Missing agentName or file" }, { status: 400 });
    }

    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json({ ok: false, error: "Unsupported file type" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "File too large" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const ext = file.name.split(".").pop() || "jpg";
    const id = crypto.randomUUID();
    const storagePath = `marketing-business-assets/${agentName}/original/${id}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from("marketing-business-assets")
      .upload(storagePath, buf, {
        contentType: file.type,
        upsert: false,
      });

    if (upErr) throw upErr;

    const { error: dbErr } = await supabase
      .from("marketing_business_assets")
      .insert({
        agent_name: agentName,
        storage_path: storagePath,
        kind,
        mime_type: file.type,
        file_size_bytes: file.size,
      });

    if (dbErr) throw dbErr;

    return NextResponse.json({
      ok: true,
      storagePath,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}
