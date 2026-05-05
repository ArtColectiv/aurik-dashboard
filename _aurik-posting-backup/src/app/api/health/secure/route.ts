import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const apiKey = req.headers.get("x-api-key");

  if (apiKey !== process.env.AURIK_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    app: "aurik-push",
    secure: true,
    timestamp: new Date().toISOString(),
  });
}