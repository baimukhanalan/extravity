"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ReviewOutcome } from "@prisma/client";
import { getT } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/**
 * Outcome + review: a student records what happened with an opportunity
 * (applied / accepted / rejected / withdrew) and optionally leaves a short note.
 * This drives social proof on the card and success-based ranking. The
 * denormalized appliedCount/acceptedCount on Opportunity are recomputed from the
 * reviews so the catalog can sort without aggregating each query.
 */

const schema = z.object({
  outcome: z.enum(["APPLIED", "ACCEPTED", "REJECTED", "WITHDREW"]),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(1000).optional(),
  isPublic: z.boolean().default(true),
});

export type ReviewState = { error?: string; success?: boolean } | undefined;

/** Recompute the denormalized counters from the source-of-truth reviews. */
async function recountOutcomes(opportunityId: string): Promise<void> {
  const [applied, accepted] = await Promise.all([
    // "Applied" counts anyone who at least applied — accepted/rejected/withdrew all imply an application.
    prisma.opportunityReview.count({ where: { opportunityId } }),
    prisma.opportunityReview.count({ where: { opportunityId, outcome: "ACCEPTED" } }),
  ]);
  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { appliedCount: applied, acceptedCount: accepted },
  });
}

export async function submitReview(opportunityId: string, formData: FormData): Promise<ReviewState> {
  const user = await requireUser();
  const { t } = await getT();

  const parsed = schema.safeParse({
    outcome: String(formData.get("outcome") || ""),
    rating: formData.get("rating") || undefined,
    comment: String(formData.get("comment") || "").trim() || undefined,
    isPublic: formData.get("isPublic") !== "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId }, select: { id: true, slug: true } });
  if (!opp) return { error: t.actA.opportunityNotFound };

  await prisma.opportunityReview.upsert({
    where: { userId_opportunityId: { userId: user.id, opportunityId } },
    create: {
      userId: user.id,
      opportunityId,
      outcome: parsed.data.outcome as ReviewOutcome,
      rating: parsed.data.rating ?? null,
      comment: parsed.data.comment ?? null,
      isPublic: parsed.data.isPublic,
    },
    update: {
      outcome: parsed.data.outcome as ReviewOutcome,
      rating: parsed.data.rating ?? null,
      comment: parsed.data.comment ?? null,
      isPublic: parsed.data.isPublic,
    },
  });

  await recountOutcomes(opportunityId);
  await prisma.auditLog.create({
    data: { userId: user.id, action: "review_submitted", entity: "opportunity", entityId: opportunityId, meta: { outcome: parsed.data.outcome } },
  });

  revalidatePath(`/opportunities/${opp.slug}`);
  return { success: true };
}
