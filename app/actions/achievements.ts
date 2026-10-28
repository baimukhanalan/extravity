"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AchievementType } from "@prisma/client";
import { getT } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export type AchievementState = { error?: string; success?: boolean } | undefined;

export async function addAchievement(_prev: AchievementState, formData: FormData): Promise<AchievementState> {
  const user = await requireUser();
  const { t } = await getT();
  const schema = z.object({
    title: z.string().min(1, t.actA.titleRequired),
    organization: z.string().optional(),
    type: z.nativeEnum(AchievementType).default(AchievementType.PARTICIPATION),
    date: z.string().optional(),
    role: z.string().optional(),
    description: z.string().optional(),
    result: z.string().optional(),
    level: z.string().optional(),
  });
  const parsed = schema.safeParse({
    title: String(formData.get("title") || "").trim(),
    organization: String(formData.get("organization") || "").trim() || undefined,
    type: String(formData.get("type") || "PARTICIPATION"),
    date: String(formData.get("date") || "") || undefined,
    role: String(formData.get("role") || "").trim() || undefined,
    description: String(formData.get("description") || "").trim() || undefined,
    result: String(formData.get("result") || "").trim() || undefined,
    level: String(formData.get("level") || "").trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.achievement.create({
    data: {
      userId: user.id,
      title: parsed.data.title,
      organization: parsed.data.organization,
      type: parsed.data.type,
      date: parsed.data.date && !Number.isNaN(Date.parse(parsed.data.date)) ? new Date(parsed.data.date) : null,
      role: parsed.data.role,
      description: parsed.data.description,
      result: parsed.data.result,
      level: parsed.data.level,
    },
  });
  revalidatePath("/app/achievements");
  revalidatePath("/app/portfolio");
  return { success: true };
}

export async function deleteAchievement(id: string) {
  const user = await requireUser();
  await prisma.achievement.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/app/achievements");
  revalidatePath("/app/portfolio");
}
