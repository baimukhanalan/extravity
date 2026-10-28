"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { OpportunityMediaRightsState, OpportunityStatus, Format, SubmissionStatus, VerificationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireRole, isStaff } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { slugify } from "@/lib/slug";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import { publicationGate } from "@/lib/opportunity-publication";
import { audienceStatusFromProvenance, ingestUnknownTermsFromProvenance } from "@/lib/opportunity-moderation";
import { normalizeMediaRightsEvidence } from "@/lib/media-rights-evidence";
import { isKnownExtravityGeneratedMedia, isPublicTelegramPostUrl } from "@/lib/source-media-provenance";
import { publicationReviewSchema } from "@/lib/publication-review";
import { isOpportunityPriceKnown } from "@/lib/opportunity-price";
import { duplicateReviewFromProvenance } from "@/lib/ingest-duplicate";

const createSchema = z.object({
  title: z.string().min(3),
  shortDescription: z.string().min(5),
  fullDescription: z.string().min(5),
  categorySlug: z.string().min(1),
  organizerName: z.string().min(1),
  city: z.string().optional(),
  format: z.string().default("OFFLINE"),
  price: z.coerce.number().int().min(0).default(0),
  minimumGrade: z.coerce.number().int().optional(),
  maximumGrade: z.coerce.number().int().optional(),
  applicationDeadline: z.string().optional(),
  trustScore: z.coerce.number().int().min(0).max(100).default(60),
  prestigeScore: z.coerce.number().int().min(0).max(100).default(50),
  status: z.string().default("PUBLISHED"),
});

export type AdminFormState = { error?: string } | undefined;

export async function createOpportunity(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const { t } = await getT();
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse({
    title: String(formData.get("title") || "").trim(),
    shortDescription: String(formData.get("shortDescription") || "").trim(),
    fullDescription: String(formData.get("fullDescription") || "").trim(),
    categorySlug: String(formData.get("categorySlug") || ""),
    organizerName: String(formData.get("organizerName") || "").trim(),
    city: String(formData.get("city") || "").trim() || undefined,
    format: String(formData.get("format") || "OFFLINE"),
    price: formData.get("price"),
    minimumGrade: formData.get("minimumGrade") || undefined,
    maximumGrade: formData.get("maximumGrade") || undefined,
    applicationDeadline: String(formData.get("applicationDeadline") || "") || undefined,
    trustScore: formData.get("trustScore") ?? 60,
    prestigeScore: formData.get("prestigeScore") ?? 50,
    status: String(formData.get("status") || "PUBLISHED"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const category = await prisma.category.findUnique({ where: { slug: d.categorySlug } });
  if (!category) return { error: t.actB.categoryNotFound };

  let slug = slugify(d.title);
  if (await prisma.opportunity.findUnique({ where: { slug } })) {
    slug = `${slug}-${Math.floor(Date.now() / 1000) % 10000}`;
  }

  await prisma.opportunity.create({
    data: {
      slug,
      title: d.title,
      shortDescription: d.shortDescription,
      fullDescription: d.fullDescription,
      categoryId: category.id,
      organizerName: d.organizerName,
      city: d.city,
      format: d.format as Format,
      price: d.price,
      minimumGrade: d.minimumGrade,
      maximumGrade: d.maximumGrade,
      applicationDeadline: d.applicationDeadline ? new Date(d.applicationDeadline) : null,
      trustScore: d.trustScore,
      prestigeScore: d.prestigeScore,
      status: "PENDING_REVIEW",
      moderationStatus: "PENDING",
      sourceType: "manual",
      lastCheckedAt: new Date(),
      verifiedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: { userId: admin.id, action: "opportunity_created", entity: "opportunity" },
  });

  revalidatePath("/admin/opportunities");
  redirect("/admin/opportunities");
}

export async function setOpportunityStatus(id: string, status: OpportunityStatus, review?: unknown) {
  const admin = await requireAdmin();
  if (["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"].includes(status)) {
    const confirmedReview = publicationReviewSchema.safeParse(review);
    if (!confirmedReview.success) return { ok: false as const, reasons: ["publication_review_required"] };
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      select: {
        title: true,
        shortDescription: true,
        fullDescription: true,
        sourceUrl: true,
        applicationUrl: true,
        applicationDeadline: true,
        confidenceScore: true,
        moderationStatus: true,
        organizerName: true,
        country: true,
        provenance: { select: { adminOnlyJson: true } },
        media: { select: { processingState: true, rightsState: true, rightsEvidenceRef: true, url: true, storageKey: true, platformMediaId: true } },
        minimumAge: true,
        maximumAge: true,
        minimumGrade: true,
        maximumGrade: true,
        allowedCitizenships: true,
        requiredLanguages: true,
        requiredDocuments: true,
        requirements: true,
        format: true,
        city: true,
        price: true,
        sourceType: true,
        participationType: true,
        minimumTeamSize: true,
        maximumTeamSize: true,
      },
    });
    if (!opportunity) return { ok: false as const, reasons: ["not_found"] };
    const priceKnown = isOpportunityPriceKnown(opportunity);
    if (confirmedReview.data.priceConfirmed !== priceKnown || confirmedReview.data.priceUnspecifiedReviewed === priceKnown) {
      return { ok: false as const, reasons: ["price_review_mismatch"] };
    }
    const gate = publicationGate({
      ...opportunity,
      allowUnknownPrice: confirmedReview.data.priceUnspecifiedReviewed,
      ingestUnknownTerms: ingestUnknownTermsFromProvenance(opportunity.provenance?.adminOnlyJson),
      audienceStatus: audienceStatusFromProvenance(opportunity.provenance?.adminOnlyJson),
      duplicateReviewRequired: Boolean(duplicateReviewFromProvenance(opportunity.provenance?.adminOnlyJson) && !duplicateReviewFromProvenance(opportunity.provenance?.adminOnlyJson)?.resolvedAt),
      moderationStatus: "APPROVED",
    });
    if (!gate.allowed) {
      await prisma.auditLog.create({
        data: { userId: admin.id, action: "opportunity_publish_rejected", entity: "opportunity", entityId: id, meta: { status, reasons: gate.reasons } },
      });
      return { ok: false as const, reasons: gate.reasons };
    }
    await prisma.$transaction(async (tx) => {
      await tx.opportunity.update({
        where: { id },
        data: { status, moderationStatus: "APPROVED" },
      });
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: "opportunity_status_change",
          entity: "opportunity",
          entityId: id,
          meta: { status, publicationReview: confirmedReview.data, reviewedAt: new Date().toISOString() },
        },
      });
    });
    revalidatePath("/admin/opportunities");
    revalidatePath("/admin/moderation");
    return { ok: true as const };
  }
  await prisma.opportunity.update({
    where: { id },
    data: {
      status,
      ...(status === "REJECTED" ? { moderationStatus: "REJECTED" as const } : {}),
    },
  });
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "opportunity_status_change", entity: "opportunity", entityId: id, meta: { status } },
  });
  revalidatePath("/admin/opportunities");
  revalidatePath("/admin/moderation");
  return { ok: true as const };
}

export async function confirmDistinctOpportunity(id: string, evidenceRef: string) {
  const admin = await requireAdmin();
  const evidence = z.string().trim().min(8).max(500).safeParse(evidenceRef);
  if (!evidence.success) return { ok: false as const, reasons: ["duplicate_review_evidence_required"] };
  const result = await prisma.$transaction(async (tx) => {
    const provenance = await tx.opportunityProvenance.findUnique({
      where: { opportunityId: id },
      select: { adminOnlyJson: true },
    });
    const duplicate = duplicateReviewFromProvenance(provenance?.adminOnlyJson);
    if (!duplicate || duplicate.resolvedAt) return false;
    const original = provenance?.adminOnlyJson && typeof provenance.adminOnlyJson === "object" && !Array.isArray(provenance.adminOnlyJson)
      ? provenance.adminOnlyJson as Record<string, unknown> : {};
    await tx.opportunityProvenance.update({
      where: { opportunityId: id },
      data: { adminOnlyJson: { ...original, potentialDuplicate: {
        ...duplicate, resolvedAt: new Date().toISOString(), evidenceRef: evidence.data, reviewedBy: admin.id,
      } } },
    });
    await tx.auditLog.create({
      data: { userId: admin.id, action: "opportunity_potential_duplicate_reviewed", entity: "opportunity", entityId: id,
        meta: { matchedOpportunityId: duplicate.matchedOpportunityId, evidenceRef: evidence.data } },
    });
    return true;
  });
  if (result) revalidatePath("/admin/moderation");
  return { ok: result as boolean };
}

export async function rejectOpportunityAsJunk(id: string) {
  const admin = await requireAdmin();
  const rejected = await prisma.$transaction(async (tx) => {
    const result = await tx.opportunity.updateMany({
      where: { id, status: { in: ["PENDING_REVIEW", "SUSPICIOUS"] } },
      data: { status: "REJECTED", moderationStatus: "REJECTED" },
    });
    if (result.count !== 1) return false;
    await tx.auditLog.create({
      data: {
        userId: admin.id,
        action: "opportunity_rejected_as_junk",
        entity: "opportunity",
        entityId: id,
        meta: { reason: "admin_irrelevant_content_review" },
      },
    });
    return true;
  });
  if (!rejected) return { ok: false as const, reason: "not_in_moderation" as const };
  revalidatePath("/admin/opportunities");
  revalidatePath("/admin/moderation");
  return { ok: true as const };
}

export async function setOpportunityMediaRights(id: string, rightsState: OpportunityMediaRightsState, evidenceRef?: string) {
  const admin = await requireAdmin();
  if (!["APPROVED", "REJECTED", "SOURCE_POST"].includes(rightsState)) {
    return { ok: false as const, reason: "invalid_state" as const };
  }
  const normalizedEvidence = normalizeMediaRightsEvidence(evidenceRef);
  if (rightsState !== "REJECTED" && !normalizedEvidence) {
    return { ok: false as const, reason: "evidence_required" as const };
  }
  const result = await prisma.$transaction(async (tx) => {
    const media = await tx.opportunityMedia.findUnique({
      where: { id },
      select: {
        url: true,
        storageKey: true,
        platformMediaId: true,
        rightsEvidenceRef: true,
        opportunity: { select: { sourceType: true, sourceUrl: true } },
      },
    });
    if (!media) return { ok: false as const, reason: "not_found" as const };
    if (rightsState === "SOURCE_POST" && (!isPublicTelegramPostUrl(media.opportunity.sourceUrl)
      || !["telegram", "telegram_forward"].includes(media.opportunity.sourceType)
      || !media.platformMediaId?.trim()
      || normalizedEvidence !== media.opportunity.sourceUrl)) {
      return { ok: false as const, reason: "source_post_mismatch" as const };
    }
    if (rightsState !== "REJECTED" && (isKnownExtravityGeneratedMedia(media)
      || isKnownExtravityGeneratedMedia({ ...media, rightsEvidenceRef: normalizedEvidence }))) {
      return { ok: false as const, reason: "generated_media_not_source" as const };
    }
    await tx.opportunityMedia.update({
      where: { id },
      data: { rightsState, rightsEvidenceRef: rightsState === "REJECTED" ? null : normalizedEvidence },
    });
    await tx.auditLog.create({
      data: {
        userId: admin.id,
        action: "opportunity_media_rights_change",
        entity: "opportunity_media",
        entityId: id,
        meta: { rightsState, evidenceRef: normalizedEvidence, reviewedAt: new Date().toISOString() },
      },
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;
  revalidatePath("/admin/moderation");
  revalidatePath("/opportunities");
  return { ok: true as const };
}

export async function reviewSubmission(id: string, status: SubmissionStatus, note?: string) {
  const { t } = await getT();
  const admin = await requireAdmin();
  const existing = await prisma.userSubmission.findUnique({ where: { id }, select: { status: true, userId: true } });
  if (!existing) return;
  const submission = await prisma.userSubmission.update({
    where: { id },
    data: { status, reviewNote: note },
  });
  // Award points only on a genuine transition INTO approved — re-approving an
  // already-approved submission must not repeatedly grant points.
  if (status === "APPROVED" && existing.status !== "APPROVED") {
    await prisma.user.update({ where: { id: submission.userId }, data: { points: { increment: 10 } } });
  }

  await notify({
    userId: submission.userId,
    type: "submission_result",
    title: status === "APPROVED" ? t.actB.submissionApprovedTitle : t.actB.submissionReviewedTitle,
    body:
      status === "APPROVED"
        ? t.actB.submissionApprovedBody
        : t.actB.submissionRejectedBody,
    link: "/app/submit",
  });
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "submission_reviewed", entity: "user_submission", entityId: id, meta: { status } },
  });
  revalidatePath("/admin/submissions");
  revalidatePath("/admin/moderation");
}

export async function reviewOrganizer(id: string, status: VerificationStatus, note?: string) {
  const { t } = await getT();
  const admin = await requireAdmin();
  const organizer = await prisma.organizer.update({
    where: { id },
    data: { verificationStatus: status, verificationNote: note || null },
  });

  // Verification status is denormalized onto the cards for catalog badges.
  await prisma.opportunity.updateMany({
    where: { organizerId: id },
    data: { organizerVerified: status },
  });

  if (organizer.userId) {
    await notify({
      userId: organizer.userId,
      type: "organizer_verification",
      title: status === "VERIFIED" ? t.actB.organizerVerifiedTitle : t.actB.organizerReviewedTitle,
      body:
        status === "VERIFIED"
          ? t.actB.organizerVerifiedBody
          : interpolate(t.actB.organizerRejectedBody, { note: note ? `: ${note}` : "" }),
      link: "/organizer/profile",
    });
  }

  await prisma.auditLog.create({
    data: { userId: admin.id, action: "organizer_reviewed", entity: "organizer", entityId: id, meta: { status } },
  });
  revalidatePath("/admin/organizers");
}

export async function toggleFeatureFlag(key: string) {
  // Global config change — restrict to full admins, not moderators.
  const admin = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const flag = await prisma.featureFlag.findUnique({ where: { key } });
  if (!flag) return;
  await prisma.featureFlag.update({ where: { key }, data: { enabled: !flag.enabled } });
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "feature_flag_toggled", entity: "feature_flag", entityId: key, meta: { enabled: !flag.enabled } },
  });
  revalidatePath("/admin/flags");
}

export async function toggleUserActive(id: string) {
  // Deactivating accounts is admin-only, and a non-super-admin may never touch a
  // staff account (prevents a moderator/admin from locking out other staff).
  const admin = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return;
  if (isStaff(u.role) && admin.role !== "SUPER_ADMIN") return;
  const isActive = !u.isActive;
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        isActive,
        ...(!isActive && {
          telegramChatId: null,
          telegramLinkTokenHash: null,
          telegramLinkTokenExpiresAt: null,
        }),
      },
    }),
    ...(!isActive
      ? [
          prisma.notificationPreference.upsert({
            where: { userId: id },
            create: { userId: id, telegram: false },
            update: { telegram: false },
          }),
        ]
      : []),
  ]);
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "user_toggled", entity: "user", entityId: id, meta: { isActive } },
  });
  revalidatePath("/admin/users");
}
