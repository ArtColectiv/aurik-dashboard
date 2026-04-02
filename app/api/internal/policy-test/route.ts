// app/api/internal/policy-test/route.ts

import { NextResponse } from "next/server";
import { evaluateActionPolicy } from "@/lib/aurik/actions/policyEngine";

export async function GET() {
  const test1 = evaluateActionPolicy("create_social_post", {
    agentLevel: 3,
    activeSkillPacks: ["marketing"],
  });

  const test2 = evaluateActionPolicy("adjust_price", {
    agentLevel: 7,
    activeSkillPacks: ["finance"],
  });

  const test3 = evaluateActionPolicy("launch_ads_campaign", {
    agentLevel: 2,
    activeSkillPacks: ["marketing"],
  });

  return NextResponse.json({
    test1,
    test2,
    test3,
  });
}