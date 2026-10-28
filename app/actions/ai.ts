"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { getT } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isFlagEnabled } from "@/lib/flags";
import { generateText, type PromptType } from "@/lib/ai";

export type AiGenResult =
  | { ok: true; id: string; output: string; version: number; model: string }
  | { ok: false; error: string };

export async function generateDraft(
  applicationId: string | null,
  promptType: PromptType,
  input: string,
): Promise<AiGenResult> {
  const user = await requireUser();
  const { t } = await getT();

  if (!(await isFlagEnabled("ai_application_assistant"))) {
    return { ok: false, error: t.actA.aiAssistantDisabled };
  }
  if (input.trim().length < 3) {
    return { ok: false, error: t.actA.aiAddFacts };
  }

  // Only associate the generation with an application the caller actually owns —
  // never tag/ revalidate another user's application id.
  const ownedAppId =
    applicationId &&
    (await prisma.application.findFirst({ where: { id: applicationId, userId: user.id }, select: { id: true } }))
      ? applicationId
      : null;

  const prior = await prisma.aiGeneration.count({
    where: { userId: user.id, applicationId: ownedAppId ?? undefined, promptType },
  });
  const result = await generateText(promptType, input);
  const gen = await prisma.aiGeneration.create({
    data: {
      userId: user.id,
      applicationId: ownedAppId ?? undefined,
      promptType,
      inputHash: createHash("sha256").update(input).digest("hex"),
      model: result.model,
      output: result.output,
      version: prior + 1,
      tokenUsage: result.tokenUsage,
      safetyStatus: result.safetyStatus,
    },
  });

  if (ownedAppId) revalidatePath(`/app/applications/${ownedAppId}`);
  return { ok: true, id: gen.id, output: result.output, version: gen.version, model: result.model };
}

export async function acceptGeneration(id: string, finalText: string, edited: boolean) {
  const user = await requireUser();
  await prisma.aiGeneration.updateMany({
    where: { id, userId: user.id },
    data: { accepted: true, edited, finalText },
  });
}

export async function rejectGeneration(id: string) {
  const user = await requireUser();
  await prisma.aiGeneration.updateMany({ where: { id, userId: user.id }, data: { accepted: false } });
}
