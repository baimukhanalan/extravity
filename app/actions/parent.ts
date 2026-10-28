"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ConsentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, requireParent, getCurrentUser } from "@/lib/auth";
import { notify, sendEmail } from "@/lib/notifications";
import { getT } from "@/lib/locale";
import { interpolate, type Dict } from "@/lib/i18n";
import { escapeHtml } from "@/lib/escape-html";

const CONSENT_TYPES: ConsentType[] = ["DATA_PROCESSING", "DOCUMENT_STORAGE", "DATA_SHARING", "APPLICATION_SUBMIT"];

const makeInviteSchema = (t: Dict) => z.object({
  parentEmail: z.string().email(t.actB.invalidParentEmail),
  parentName: z.string().max(120).optional(),
});

export type ParentInviteState = { error?: string; success?: boolean } | undefined;

export async function inviteParent(_prev: ParentInviteState, formData: FormData): Promise<ParentInviteState> {
  const { t } = await getT();
  const user = await requireUser();
  const parsed = makeInviteSchema(t).safeParse({
    parentEmail: String(formData.get("parentEmail") || "").trim().toLowerCase(),
    parentName: String(formData.get("parentName") || "").trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const token = randomBytes(24).toString("hex");
  const link = await prisma.parentStudentLink.create({
    data: {
      studentUserId: user.id,
      parentEmail: parsed.data.parentEmail,
      parentName: parsed.data.parentName,
      inviteToken: token,
      consents: {
        create: CONSENT_TYPES.map((type) => ({ type, studentUserId: user.id })),
      },
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const consentUrl = `${appUrl}/parent/consent/${token}`;
  const studentName = user.studentProfile ? `${user.studentProfile.firstName} ${user.studentProfile.lastName}` : user.email;

  const delivered = await sendEmail(
    parsed.data.parentEmail,
    t.actB.parentInviteEmailSubject,
    `<p>${escapeHtml(interpolate(t.actB.parentInviteEmailIntro, { studentName }))}</p>
     <p>${escapeHtml(t.actB.confirmConsentsViaLink)}</p>
     <p><a href="${escapeHtml(consentUrl)}">${escapeHtml(consentUrl)}</a></p>`,
  );
  if (!delivered) {
    await prisma.parentStudentLink.deleteMany({ where: { id: link.id, inviteToken: token, status: "pending" } });
    return { error: t.actB.emailDeliveryFailed };
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "parent_invited", entity: "parent_student_link", entityId: link.id },
  });

  revalidatePath("/app/settings");
  return { success: true };
}

/** Public — called from the parent consent page (no auth, token-gated). */
export async function submitParentConsent(token: string, granted: ConsentType[]): Promise<{ ok: boolean }> {
  const { t } = await getT();
  const link = await prisma.parentStudentLink.findUnique({ where: { inviteToken: token }, include: { consents: true } });
  if (!link || link.status === "revoked") return { ok: false };

  // If the parent happens to be signed in under the invited address, bind the
  // link to their account so the parent portal opens up.
  if (!link.parentUserId) {
    const currentUser = await getCurrentUser();
    if (currentUser && currentUser.email.toLowerCase() === link.parentEmail.toLowerCase()) {
      await prisma.parentStudentLink.update({
        where: { id: link.id },
        data: { parentUserId: currentUser.id },
      });
    }
  }

  await prisma.$transaction([
    ...link.consents.map((c) =>
      prisma.parentConsent.update({
        where: { id: c.id },
        data: { granted: granted.includes(c.type), grantedAt: granted.includes(c.type) ? new Date() : null },
      }),
    ),
    prisma.parentStudentLink.update({
      where: { id: link.id },
      data: { status: "active", acceptedAt: new Date() },
    }),
  ]);

  await prisma.auditLog.create({
    data: { userId: link.studentUserId, action: "parent_consent_submitted", entity: "parent_student_link", entityId: link.id, meta: { granted } },
  });

  await prisma.notification.create({
    data: {
      userId: link.studentUserId,
      type: "consent_updated",
      title: t.actB.parentConfirmedConsentsTitle,
      body: interpolate(t.actB.parentUpdatedConsentsBody, { email: link.parentEmail }),
      link: "/app/settings",
    },
  });

  return { ok: true };
}

/* ---------------- Parent portal ---------------- */

/** Toggle a single consent from the parent's own account (no token needed). */
export async function setConsent(linkId: string, type: ConsentType, granted: boolean): Promise<{ ok: boolean }> {
  const { t } = await getT();
  const { user, links } = await requireParent();
  const link = links.find((l) => l.id === linkId);
  if (!link) return { ok: false };

  await prisma.parentConsent.upsert({
    where: { linkId_type: { linkId, type } },
    create: {
      linkId,
      studentUserId: link.studentUserId,
      type,
      granted,
      grantedAt: granted ? new Date() : null,
    },
    update: { granted, grantedAt: granted ? new Date() : null },
  });

  // Granting anything for the first time also activates a pending link.
  if (link.status === "pending" && granted) {
    await prisma.parentStudentLink.update({
      where: { id: linkId },
      data: { status: "active", acceptedAt: new Date() },
    });
  }

  await notify({
    userId: link.studentUserId,
    type: "consent_updated",
    title: granted ? t.actB.parentGrantedConsentTitle : t.actB.parentRevokedConsentTitle,
    body: interpolate(granted ? t.actB.parentConsentGrantedBody : t.actB.parentConsentRevokedBody, {
      type,
      email: link.parentEmail,
    }),
    link: "/app/settings",
  });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "parent_consent_changed",
      entity: "parent_consent",
      entityId: linkId,
      meta: { type, granted },
    },
  });

  revalidatePath("/parent");
  revalidatePath("/parent/consents");
  return { ok: true };
}

/** The parent ends their own link to a student. */
export async function revokeParentLink(linkId: string): Promise<void> {
  const { t } = await getT();
  const { user, links } = await requireParent();
  const link = links.find((l) => l.id === linkId);
  if (!link) return;

  await prisma.$transaction([
    prisma.parentStudentLink.update({ where: { id: linkId }, data: { status: "revoked" } }),
    prisma.parentConsent.updateMany({ where: { linkId }, data: { granted: false, grantedAt: null } }),
  ]);

  await notify({
    userId: link.studentUserId,
    type: "consent_updated",
    title: t.actB.parentRevokedAccessTitle,
    body: interpolate(t.actB.parentRevokedLinkBody, { email: link.parentEmail }),
    link: "/app/settings",
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "parent_link_revoked", entity: "parent_student_link", entityId: linkId },
  });

  revalidatePath("/parent");
  revalidatePath("/parent/consents");
}
