import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = supabaseServer();

    const { error } = await supabase
      .from("posting_users")
      .select("id", { count: "exact", head: true });

    if (error) {
      return NextResponse.json({
        ok: false,
        error: error.message,
      });
    }

    return NextResponse.json({
      ok: true,
      db: "connected",
      tables: "posting_ready",
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: "server error",
    });
  }
}