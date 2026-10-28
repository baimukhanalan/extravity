"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, getDictionary, isLocale } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/notifications";

/**
 * Comments let a linked counsellor or parent give feedback on a student's
 * application draft. Access is relational and checked here, not in the schema:
 * you may comment on an application only if it is yours, or you have an active
 * link to the student that owns it.
 */

type Access = { role: "student" | "counselor" | "parent"; studentUserId: string } | null;

/** Resolves whether `viewerId` may access `applicationId`, and in what role. */
async function resolveAccess(applicationId: string, viewerId: string): Promise<Access> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { userId: true },
  });
  if (!application) return null;

  if (application.userId === viewerId) {
    return { role: "student", studentUserId: application.userId };
  }

  // Active counsellor link to the student?
  const counselor = await prisma.counselorProfile.findUnique({ where: { userId: viewerId }, select: { id: true } });
  if (counselor) {
    const link = await prisma.counselorStudentLink.findFirst({
      where: { counselorId: counselor.id, studentUserId: application.userId, status: "active" },
      select: { id: true },
    });
    if (link) return { role: "counselor", studentUserId: application.userId };
  }

  // Active parent link to the student?
  const parentLink = await prisma.parentStudentLink.findFirst({
    where: { parentUserId: viewerId, studentUserId: application.userId, status: "active" },
    select: { id: true },
  });
  if (parentLink) return { role: "parent", studentUserId: application.userId };

  return null;
}

export type CommentState = { error?: string; success?: boolean } | undefined;

export async function addApplicationComment(applicationId: string, body: string): Promise<CommentState> {
  const user = await requireUser();
  const { t } = await getT();
  const bodySchema = z.string().trim().min(1, t.actA.commentEmpty).max(2000);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const access = await resolveAccess(applicationId, user.id);
  if (!access) return { error: t.actA.noAccessToApplication };

  await prisma.applicationComment.create({
    data: { applicationId, authorUserId: user.id, authorRole: access.role, body: parsed.data },
  });

  // Notify the student when a mentor comments (not on the student's own note).
  if (access.role !== "student") {
    // The notification is persisted and read by the student, so localize the
    // stored title to the recipient's language, not the acting mentor's.
    const recipient = await prisma.user.findUnique({
      where: { id: access.studentUserId },
      select: { locale: true },
    });
    const recipientLocale = recipient?.locale;
    const rt = getDictionary(isLocale(recipientLocale) ? recipientLocale : DEFAULT_LOCALE);
    await notify({
      userId: access.studentUserId,
      type: "application_comment",
      title: access.role === "counselor" ? rt.actA.commentNotifCounselorTitle : rt.actA.commentNotifParentTitle,
      body: parsed.data.slice(0, 140),
      link: `/app/applications/${applicationId}`,
    });
  }

  revalidatePath(`/app/applications/${applicationId}`);
  revalidatePath(`/counselor/students/${access.studentUserId}`);
  return { success: true };
}

export async function deleteApplicationComment(commentId: string): Promise<void> {
  const user = await requireUser();
  // You can delete only your own comment.
  const comment = await prisma.applicationComment.findUnique({
    where: { id: commentId },
    select: { id: true, authorUserId: true, applicationId: true },
  });
  if (!comment || comment.authorUserId !== user.id) return;
  await prisma.applicationComment.delete({ where: { id: comment.id } });
  revalidatePath(`/app/applications/${comment.applicationId}`);
}
