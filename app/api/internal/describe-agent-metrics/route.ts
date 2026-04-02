// app/api/internal/describe-agent-metrics/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/aurik/supabaseServer";

export async function GET() {
  try {
    const s = supabaseServer();

    // On interroge les colonnes via information_schema (Postgres standard).
    const { data, error } = await (s as any)
      .rpc("sql", {
        // Beaucoup de projets ont déjà une RPC "sql". Si tu ne l'as pas, on fera autrement.
        query: `
          select
            column_name,
            data_type,
            is_nullable
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'agent_metrics'
          order by ordinal_position;
        `,
      });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Cannot query information_schema via rpc(sql)", message: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, columns: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}