import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { evaluateMarketingImpact } from "@/lib/aurik/impact/marketingImpactService";

const Schema = z.object({
  impactId: z.string().uuid(),
  postValue: z.number(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { impactId, postValue } = parsed.data;

    await evaluateMarketingImpact({
      impactId,
      postValue,
    });

    return NextResponse.json({
      ok: true,
      impactId,
      postValue,
    });
  } catch (e: any) {
    console.error("marketing-impact-evaluate error:", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}