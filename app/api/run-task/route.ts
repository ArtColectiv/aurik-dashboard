import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabaseClient";
import { supabaseServer } from "@/lib/aurik/supabaseServer";
import { findSkillPackForTask } from "@/lib/aurik/skillpacks/registry";
import type { SkillPackTaskContext } from "@/lib/aurik/skillpacks/types";
import { hasSkillPackInstalled } from "@/lib/aurik/agentSkillPacks";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ECOSYSTEM_ID = "default";

/* ----------------------------- */
/* ZOD STRICT CONTRACT           */
/* ----------------------------- */

const RunTaskSchema = z
  .object({
    agentId: z.string().uuid(),
    task: z.string().min(1).optional(),
    skillPackTaskType: z.string().min(1).optional(),
    skillPackPayload: z.any().optional(),
  })
  .refine(
    (data) =>
      (data.task && !data.skillPackTaskType) ||
      (!data.task && data.skillPackTaskType),
    {
      message:
        "Provide either 'task' OR 'skillPackTaskType', but not both.",
    }
  );

/* ----------------------------- */
/* UTIL: Resolve agentName      */
/* ----------------------------- */

async function resolveAgentName(agentId: string) {
  const s = supabaseServer();

  const { data, error } = await s
    .from("aurik_agents")
    .select("agent_name")
    .eq("ecosystem_id", ECOSYSTEM_ID)
    .eq("id", agentId)
    .maybeSingle();

  if (error) {
    console.error("resolveAgentName error:", error.message);
    return null;
  }

  return data?.agent_name ?? null;
}

/* ----------------------------- */
/* MAIN POST                    */
/* ----------------------------- */

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY missing" },
        { status: 500 }
      );
    }

    const raw = await req.json().catch(() => null);
    const parsed = RunTaskSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { agentId, task, skillPackTaskType, skillPackPayload } =
      parsed.data;

    /* ----------------------------- */
    /* BRANCH 1 — SkillPack         */
    /* ----------------------------- */

    if (skillPackTaskType) {
      const taskContext: SkillPackTaskContext = {
        agentId,
        type: skillPackTaskType,
        payload: skillPackPayload ?? {},
        metadata: { source: "api/run-task" },
      };

      const skillPack = findSkillPackForTask(taskContext);

      if (!skillPack) {
        return NextResponse.json(
          { ok: false, error: "SkillPack not found" },
          { status: 400 }
        );
      }

      if (!hasSkillPackInstalled(agentId, skillPack.id)) {
        return NextResponse.json(
          { ok: false, error: "SkillPack not installed" },
          { status: 403 }
        );
      }

      const result = await skillPack.runTask(taskContext);

      return NextResponse.json(
        { ok: result.success, result },
        { status: result.success ? 200 : 500 }
      );
    }

    /* ----------------------------- */
    /* BRANCH 2 — Normal Task       */
    /* ----------------------------- */

    if (!task) {
      return NextResponse.json(
        { error: "Task is required" },
        { status: 400 }
      );
    }

    const agentName = await resolveAgentName(agentId);

    if (!agentName) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are the Aurik agent "${agentName}". Provide structured and actionable output.`,
        },
        { role: "user", content: task },
      ],
    });

    const result =
      completion.choices[0]?.message?.content?.trim() ?? "";

    const outputLength = result.length;

    await supabase.from("agent_events").insert([
      {
        ecosystem_id: ECOSYSTEM_ID,
        agent_name: agentName,
        event_type: "task_executed_ui",
        payload: {
          agent_id: agentId,
          task,
          result,
          output_length: outputLength,
        },
      },
    ]);

    return NextResponse.json(
      { agentId, agentName, result, outputLength },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("/api/run-task error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}