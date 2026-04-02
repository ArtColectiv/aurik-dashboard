import { NextResponse } from "next/server";
import { evaluateImpact } from "@/lib/aurik/impact/impactService";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { impactId, postValue, metaPatch } = body ?? {};

    if (!impactId || typeof postValue !== "number") {
      return NextResponse.json(
        { ok: false, error: "Invalid payload: impactId and postValue required" },
        { status: 400 }
      );
    }

    const result = await evaluateImpact({
      impactId,
      postValue,
      metaPatch,
    });

    if (!result.ok) {
      const status =
        result.error === "Impact not found" ? 404 : 400;

      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}