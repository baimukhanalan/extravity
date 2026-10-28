"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, requireCounselor } from "@/lib/auth";
import { notify, sendEmail } from "@/lib/notifications";
import { getT } from "@/lib/locale";
import { interpolate, type Dict } from "@/lib/i18n";
import { escapeHtml } from "@/lib/escape-html";

export type CounselorFormState = { error?: string; success?: boolean } | undefined;

const makeProfileSchema = (t: Dict) => z.object({
  fullName: z.string().min(2, t.actB.fullNameRequired),
  school: z.string().max(160).optional(),
  city: z.string().optional(),
  position: z.string().max(120).optional(),
});

function text(fd: FormData, key: string): string | undefined {
  const v = String(fd.get(key) || "").trim();
  return v || undefined;
}

export async function registerCounselor(
  _prev: CounselorFormState,
  formData: FormData,
): Promise<CounselorFormState> {
  const { t } = await getT();
  const user = await requireUser();
  const existing = await prisma.counselorProfile.findUnique({ where: { userId: user.id } });
  if (existing) redirect("/counselor");

  const parsed = makeProfileSchema(t).safeParse({
    fullName: String(formData.get("fullName") || "").trim(),
    school: text(formData, "school"),
    city: text(formData, "city"),
    position: text(formData, "position"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.counselorProfile.create({
    data: { ...parsed.data, userId: user.id, verificationStatus: "PENDING", verificationRequestedAt: new Date() },
  });
  if (user.role === "STUDENT" || user.role === "PARENT") {
    await prisma.user.update({ where: { id: user.id }, data: { role: "COUNSELOR" } });
  }
  await prisma.auditLog.create({
    data: { userId: user.id, action: "counselor_registered", entity: "counselor_profile" },
  });

  redirect("/counselor");
}

export async function updateCounselorProfile(
  _prev: CounselorFormState,
  formData: FormData,
): Promise<CounselorFormState> {
  const { t } = await getT();
  const { profile } = await requireCounselor();
  const parsed = makeProfileSchema(t).safeParse({
    fullName: String(formData.get("fullName") || "").trim(),
    school: text(formData, "school"),
    city: text(formData, "city"),
    position: text(formData, "position"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.counselorProfile.update({ where: { id: profile.id }, data: parsed.data });
  revalidatePath("/counselor/profile");
  return { success: true };
}

/* ---------------- Students ---------------- */

const makeInviteSchema = (t: Dict) => z.object({
  studentEmail: z.string().email(t.actB.invalidStudentEmail),
  note: z.string().max(300).optional(),
});

export async function inviteStudent(
  _prev: CounselorFormState,
  formData: FormData,
): Promise<CounselorFormState> {
  const { t } = await getT();
  const { user, profile } = await requireCounselor();
  const parsed = makeInviteSchema(t).safeParse({
    studentEmail: String(formData.get("studentEmail") || "").trim().toLowerCase(),
    note: text(formData, "note"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { studentEmail, note } = parsed.data;

  if (studentEmail === user.email.toLowerCase()) return { error: t.actB.cannotInviteYourself };

  const existing = await prisma.counselorStudentLink.findUnique({
    where: { counselorId_studentEmail: { counselorId: profile.id, studentEmail } },
  });
  if (existing && existing.status !== "revoked" && existing.status !== "declined") {
    return { error: t.actB.studentAlreadyInvited };
  }

  const token = randomBytes(24).toString("hex");
  let linkId: string;
  if (existing) {
    const updated = await prisma.counselorStudentLink.updateMany({
      where: { id: existing.id, status: existing.status, inviteToken: existing.inviteToken },
      data: { status: "pending", inviteToken: token, note, studentUserId: null, acceptedAt: null },
    });
    if (updated.count !== 1) return { error: t.actB.studentAlreadyInvited };
    linkId = existing.id;
  } else {
    try {
      const created = await prisma.counselorStudentLink.create({
        data: { counselorId: profile.id, studentEmail, note, inviteToken: token },
      });
      linkId = created.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { error: t.actB.studentAlreadyInvited };
      }
      throw error;
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteUrl = `${appUrl}/counselor/invite/${token}`;

  // Possession of the emailed token, not an unverified account email, authorizes attachment.
  const delivered = await sendEmail(
    studentEmail,
    t.actB.counselorInviteEmailSubject,
    `<p>${escapeHtml(interpolate(t.actB.counselorInviteEmailIntro, {
      name: `${profile.fullName}${profile.school ? ` (${profile.school})` : ""}`,
    }))}</p>
     <p>${escapeHtml(t.actB.registerAndAcceptViaLink)}</p>
     <p><a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a></p>`,
  );

  if (!delivered) {
    if (existing) {
      await prisma.counselorStudentLink.updateMany({
        where: { id: linkId, inviteToken: token },
        data: {
          status: existing.status,
          inviteToken: existing.inviteToken,
          note: existing.note,
          studentUserId: existing.studentUserId,
          acceptedAt: existing.acceptedAt,
        },
      });
    } else {
      await prisma.counselorStudentLink.deleteMany({ where: { id: linkId, inviteToken: token } });
    }
    return { error: t.actB.emailDeliveryFailed };
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "counselor_invited_student", entity: "counselor_student_link", entityId: linkId },
  });

  revalidatePath("/counselor/students");
  return { success: true };
}

export async function revokeStudentLink(linkId: string): Promise<void> {
  const { user, profile } = await requireCounselor();
  const link = await prisma.counselorStudentLink.findUnique({ where: { id: linkId } });
  if (!link || link.counselorId !== profile.id) return;

  await prisma.counselorStudentLink.update({ where: { id: linkId }, data: { status: "revoked" } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "counselor_link_revoked", entity: "counselor_student_link", entityId: linkId },
  });
  revalidatePath("/counselor/students");
}

/** Called by the student from the invite page — the link is only active after this. */
export async function respondToCounselorInvite(token: string, accept: boolean): Promise<{ ok: boolean }> {
  const { t } = await getT();
  const user = await requireUser();
  const link = await prisma.counselorStudentLink.findUnique({
    where: { inviteToken: token },
    include: { counselor: true },
  });
  if (!link || link.status !== "pending") return { ok: false };
  if (link.studentEmail !== user.email.toLowerCase() && link.studentUserId !== user.id) return { ok: false };

  const updated = await prisma.counselorStudentLink.updateMany({
    where: {
      id: link.id,
      inviteToken: token,
      status: "pending",
      OR: [{ studentEmail: user.email.toLowerCase() }, { studentUserId: user.id }],
    },
    data: {
      status: accept ? "active" : "declined",
      studentUserId: user.id,
      acceptedAt: accept ? new Date() : null,
    },
  });
  if (updated.count !== 1) return { ok: false };

  await notify({
    userId: link.counselor.userId,
    type: "counselor_invite_result",
    title: accept ? t.actB.studentAcceptedInviteTitle : t.actB.studentDeclinedInviteTitle,
    body: interpolate(accept ? t.actB.studentAcceptedInviteBody : t.actB.studentDeclinedInviteBody, {
      email: user.email,
    }),
    link: "/counselor/students",
  });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: accept ? "counselor_invite_accepted" : "counselor_invite_declined",
      entity: "counselor_student_link",
      entityId: link.id,
    },
  });

  revalidatePath("/counselor/students");
  return { ok: true };
}

/** The student can end the link at any time from their settings. */
export async function leaveCounselor(linkId: string): Promise<void> {
  const user = await requireUser();
  const link = await prisma.counselorStudentLink.findUnique({ where: { id: linkId } });
  if (!link || link.studentUserId !== user.id) return;

  await prisma.counselorStudentLink.update({ where: { id: linkId }, data: { status: "revoked" } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "counselor_link_left", entity: "counselor_student_link", entityId: linkId },
  });
  revalidatePath("/app/settings");
}

/** Suggest an opportunity to a linked student — arrives as a notification. */
export async function recommendToStudent(studentUserId: string, opportunityId: string): Promise<{ ok: boolean }> {
  const { t } = await getT();
  const { profile } = await requireCounselor();
  const link = await prisma.counselorStudentLink.findFirst({
    where: { counselorId: profile.id, studentUserId, status: "active" },
  });
  if (!link) return { ok: false };

  const opportunity = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity) return { ok: false };

  await notify({
    userId: studentUserId,
    type: "counselor_recommendation",
    title: t.actB.counselorRecommendsTitle,
    body: interpolate(t.actB.counselorRecommendsBody, {
      name: profile.fullName,
      title: opportunity.title,
    }),
    link: `/opportunities/${opportunity.slug}`,
  });

  revalidatePath(`/counselor/students/${studentUserId}`);
  return { ok: true };
}
