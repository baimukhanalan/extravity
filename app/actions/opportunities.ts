"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { track } from "@/lib/observability";
import { getT } from "@/lib/locale";
import type { Dict } from "@/lib/i18n";

export async function toggleSave(opportunityId: string): Promise<{ saved: boolean }> {
  const user = await requireUser();
  const existing = await prisma.savedOpportunity.findUnique({
    where: { userId_opportunityId: { userId: user.id, opportunityId } },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.savedOpportunity.delete({ where: { id: existing.id } }),
      prisma.opportunity.update({ where: { id: opportunityId }, data: { saveCount: { decrement: 1 } } }),
    ]);
    revalidatePath("/app/saved");
    return { saved: false };
  }

  await prisma.$transaction([
    prisma.savedOpportunity.create({ data: { userId: user.id, opportunityId } }),
    prisma.opportunity.update({ where: { id: opportunityId }, data: { saveCount: { increment: 1 } } }),
  ]);
  await track("opportunity_saved", user.id, { opportunityId });
  revalidatePath("/app/saved");
  return { saved: true };
}

const makeSubmissionSchema = (t: Dict) => z.object({
  url: z.string().url(t.actB.invalidUrl),
  comment: z.string().max(500).optional(),
  category: z.string().optional(),
});

export type SubmissionState = { error?: string; success?: boolean } | undefined;

export async function submitFoundOpportunity(
  _prev: SubmissionState,
  formData: FormData,
): Promise<SubmissionState> {
  const { t } = await getT();
  const user = await requireUser();
  const parsed = makeSubmissionSchema(t).safeParse({
    url: String(formData.get("url") || "").trim(),
    comment: String(formData.get("comment") || "").trim() || undefined,
    category: String(formData.get("category") || "").trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Duplicate check by URL.
  const dupe = await prisma.userSubmission.findFirst({
    where: { url: parsed.data.url, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (dupe) return { error: t.actB.urlAlreadySubmitted };

  await prisma.userSubmission.create({
    data: {
      userId: user.id,
      url: parsed.data.url,
      comment: parsed.data.comment,
      category: parsed.data.category,
    },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "submission_created", entity: "user_submission" },
  });

  revalidatePath("/app/submit");
  return { success: true };
}
