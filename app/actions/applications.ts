"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ApplicationStatus, Prisma } from "@prisma/client";
import { interpolate } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { REQUIRED_DOCUMENTS } from "@/lib/constants";
import { track } from "@/lib/observability";
import { canTransitionApplicationStatus } from "@/lib/application-status";
import { getOpportunityAvailability } from "@/lib/opportunity-availability";
import { publicOpportunityWhere } from "@/lib/public-opportunity";
import { publicSourceMediaWhere } from "@/lib/source-media-provenance";
import { retainExactTelegramMedia } from "@/lib/exact-telegram-media";

/** Create (or open) an application workspace for an opportunity. */
export async function startApplication(opportunityId: string) {
  const user = await requireUser();
  const { t } = await getT();

  // Only student accounts own application workspaces. Other authenticated
  // portal roles must not be able to create applications by posting an ID.
  if (!user.studentProfile) redirect("/app");

  const existing = await prisma.application.findUnique({
    where: { userId_opportunityId: { userId: user.id, opportunityId } },
  });
  if (existing) redirect(`/app/applications/${existing.id}`);

  const candidate = await prisma.opportunity.findFirst({
    where: { ...publicOpportunityWhere(), id: opportunityId },
    include: { media: { where: publicSourceMediaWhere } },
  });
  const opp = candidate ? retainExactTelegramMedia(candidate) : null;
  if (!opp) redirect("/app/discover");
  if (!getOpportunityAvailability(opp).canApply) {
    redirect(`/opportunities/${opp.slug}?apply=closed`);
  }

  const checklist = [
    { id: "profile", label: t.actA.checklistProfile, done: true },
    ...opp.requiredDocuments.map((d) => ({
      id: `doc_${d}`,
      label: interpolate(t.actA.checklistDocument, { name: REQUIRED_DOCUMENTS[d] ?? d }),
      done: false,
    })),
    ...(opp.requiredDocuments.includes("motivation_letter")
      ? [{ id: "essay", label: t.actA.checklistMotivationLetter, done: false }]
      : []),
    { id: "review", label: t.actA.checklistFinalReview, done: false },
  ];

  const app = await prisma.application.create({
    data: {
      userId: user.id,
      opportunityId,
      status: "PREPARING",
      checklist,
      statusHistory: { create: { status: "PREPARING", note: "Workspace создан" } },
    },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "application_started", entity: "application", entityId: app.id },
  });
  await track("application_started", user.id, { opportunityId, category: opp.categoryId });

  redirect(`/app/applications/${app.id}`);
}

export async function toggleChecklistItem(applicationId: string, itemId: string) {
  const user = await requireUser();
  const app = await prisma.application.findFirst({ where: { id: applicationId, userId: user.id } });
  if (!app) return;

  const checklist = (app.checklist as { id: string; label: string; done: boolean }[]).map((c) =>
    c.id === itemId ? { ...c, done: !c.done } : c,
  );
  const done = checklist.filter((c) => c.done).length;
  const progress = Math.round((done / checklist.length) * 100);

  await prisma.application.update({
    where: { id: applicationId },
    data: { checklist, progress },
  });
  revalidatePath(`/app/applications/${applicationId}`);
}

export async function updateApplicationStatus(applicationId: string, status: ApplicationStatus) {
  const user = await requireUser();
  const parsed = z.nativeEnum(ApplicationStatus).safeParse(status);
  if (!parsed.success) return { ok: false as const, error: "invalid_status" as const };
  const nextStatus = parsed.data;
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    include: { opportunity: true },
  });
  if (!app) return { ok: false as const, error: "not_found" as const };
  if (nextStatus === "SUBMITTED" && !getOpportunityAvailability(app.opportunity).canApply) {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "application_submission_rejected_deadline",
        entity: "application",
        entityId: applicationId,
        meta: { opportunityId: app.opportunityId },
      },
    });
    return { ok: false as const, error: "deadline_passed" as const };
  }
  if (!canTransitionApplicationStatus(app.status, nextStatus)) {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "application_status_transition_rejected",
        entity: "application",
        entityId: applicationId,
        meta: { from: app.status, to: nextStatus },
      },
    });
    return { ok: false as const, error: "transition_not_allowed" as const };
  }

  let changed = false;
  try {
    changed = await prisma.$transaction(async (tx) => {
      const result = await tx.application.updateMany({
        where: { id: applicationId, userId: user.id, status: app.status },
        data: { status: nextStatus },
      });
      if (result.count !== 1) return false;
      await tx.applicationStatusHistory.create({ data: { applicationId, status: nextStatus } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { ok: false as const, error: "stale_status" as const };
    }
    throw error;
  }
  if (!changed) return { ok: false as const, error: "stale_status" as const };
  await prisma.auditLog.create({
    data: { userId: user.id, action: "application_status_change", entity: "application", entityId: applicationId, meta: { status } },
  });
  revalidatePath(`/app/applications/${applicationId}`);
  revalidatePath("/app/applications");
  return { ok: true as const, status: nextStatus };
}

export async function saveApplicationNotes(applicationId: string, notes: string) {
  const user = await requireUser();
  const app = await prisma.application.findFirst({ where: { id: applicationId, userId: user.id } });
  if (!app) return;
  await prisma.application.update({ where: { id: applicationId }, data: { notes } });
  revalidatePath(`/app/applications/${applicationId}`);
}
