"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Format, OpportunityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, requireOrganizer } from "@/lib/auth";
import { slugify } from "@/lib/slug";
import { parseKzDateTime } from "@/lib/utils";
import { getT } from "@/lib/locale";
import type { Dict } from "@/lib/i18n";

export type OrganizerFormState = { error?: string; success?: boolean } | undefined;

/* ---------------- Registration ---------------- */

const makeRegisterSchema = (t: Dict) => z.object({
  name: z.string().min(2, t.actB.orgNameRequired),
  type: z.string().optional(),
  bin: z.string().max(20).optional(),
  website: z.string().url(t.actB.invalidWebsite).optional().or(z.literal("").transform(() => undefined)),
  email: z.string().email(t.actB.invalidEmail).optional().or(z.literal("").transform(() => undefined)),
  phone: z.string().max(40).optional(),
  city: z.string().optional(),
  description: z.string().max(2000).optional(),
});

function text(fd: FormData, key: string): string | undefined {
  const v = String(fd.get(key) || "").trim();
  return v || undefined;
}

export async function registerOrganizer(
  _prev: OrganizerFormState,
  formData: FormData,
): Promise<OrganizerFormState> {
  const { t } = await getT();
  const user = await requireUser();
  if (user.organizer) redirect("/organizer");

  const parsed = makeRegisterSchema(t).safeParse({
    name: String(formData.get("name") || "").trim(),
    type: text(formData, "type"),
    bin: text(formData, "bin"),
    website: String(formData.get("website") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    phone: text(formData, "phone"),
    city: text(formData, "city"),
    description: text(formData, "description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.organizer.create({
    data: {
      ...parsed.data,
      userId: user.id,
      verificationStatus: "PENDING",
      verificationRequestedAt: new Date(),
    },
  });

  // Students keep their role; anyone else joining as an organizer gets the role.
  if (user.role === "STUDENT" || user.role === "PARENT") {
    await prisma.user.update({ where: { id: user.id }, data: { role: "ORGANIZER" } });
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "organizer_registered", entity: "organizer" },
  });

  redirect("/organizer");
}

/* ---------------- Profile ---------------- */

export async function updateOrganizerProfile(
  _prev: OrganizerFormState,
  formData: FormData,
): Promise<OrganizerFormState> {
  const { t } = await getT();
  const { organizer } = await requireOrganizer();
  const parsed = makeRegisterSchema(t).safeParse({
    name: String(formData.get("name") || "").trim(),
    type: text(formData, "type"),
    bin: text(formData, "bin"),
    website: String(formData.get("website") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    phone: text(formData, "phone"),
    city: text(formData, "city"),
    description: text(formData, "description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.organizer.update({ where: { id: organizer.id }, data: parsed.data });
  revalidatePath("/organizer/profile");
  return { success: true };
}

/** Re-submit for moderation after the profile was rejected or never reviewed. */
export async function requestVerification(): Promise<void> {
  const { user, organizer } = await requireOrganizer();
  if (organizer.verificationStatus === "VERIFIED") return;

  await prisma.organizer.update({
    where: { id: organizer.id },
    data: { verificationStatus: "PENDING", verificationRequestedAt: new Date(), verificationNote: null },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "organizer_verification_requested", entity: "organizer", entityId: organizer.id },
  });
  revalidatePath("/organizer/profile");
}

/* ---------------- Opportunities ---------------- */

const makeOpportunitySchema = (t: Dict) => z.object({
  title: z.string().min(3, t.actB.titleTooShort),
  shortDescription: z.string().min(5, t.actB.shortDescRequired),
  fullDescription: z.string().min(20, t.actB.fullDescTooShort),
  categorySlug: z.string().min(1, t.actB.chooseCategory),
  city: z.string().optional(),
  venue: z.string().optional(),
  format: z.string().default("OFFLINE"),
  price: z.coerce.number().int().min(0).default(0),
  minimumGrade: z.coerce.number().int().min(1).max(12).optional(),
  maximumGrade: z.coerce.number().int().min(1).max(12).optional(),
  applicationDeadline: z.string().optional(),
  eventStartDate: z.string().optional(),
  eventEndDate: z.string().optional(),
  applicationUrl: z.string().url(t.actB.invalidApplicationUrl).optional(),
  sourceUrl: z.string().url(t.actB.invalidSourceUrl).optional(),
  requirements: z.string().optional(),
  prizes: z.string().optional(),
  tags: z.string().optional(),
  certificatesAvailable: z.boolean().default(false),
  financialAidAvailable: z.boolean().default(false),
});

function parseOpportunityForm(formData: FormData, t: Dict) {
  return makeOpportunitySchema(t).safeParse({
    title: String(formData.get("title") || "").trim(),
    shortDescription: String(formData.get("shortDescription") || "").trim(),
    fullDescription: String(formData.get("fullDescription") || "").trim(),
    categorySlug: String(formData.get("categorySlug") || ""),
    city: text(formData, "city"),
    venue: text(formData, "venue"),
    format: String(formData.get("format") || "OFFLINE"),
    price: formData.get("price") || 0,
    minimumGrade: formData.get("minimumGrade") || undefined,
    maximumGrade: formData.get("maximumGrade") || undefined,
    applicationDeadline: text(formData, "applicationDeadline"),
    eventStartDate: text(formData, "eventStartDate"),
    eventEndDate: text(formData, "eventEndDate"),
    applicationUrl: text(formData, "applicationUrl"),
    sourceUrl: text(formData, "sourceUrl"),
    requirements: text(formData, "requirements"),
    prizes: text(formData, "prizes"),
    tags: text(formData, "tags"),
    certificatesAvailable: formData.get("certificatesAvailable") === "on",
    financialAidAvailable: formData.get("financialAidAvailable") === "on",
  });
}

function splitLines(value?: string): string[] {
  if (!value) return [];
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function splitTags(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function createOrganizerOpportunity(
  _prev: OrganizerFormState,
  formData: FormData,
): Promise<OrganizerFormState> {
  const { t } = await getT();
  const { user, organizer } = await requireOrganizer();
  const parsed = parseOpportunityForm(formData, t);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const category = await prisma.category.findUnique({ where: { slug: d.categorySlug } });
  if (!category) return { error: t.actB.categoryNotFound };

  let slug = slugify(d.title);
  if (await prisma.opportunity.findUnique({ where: { slug } })) {
    slug = `${slug}-${Math.floor(Date.now() / 1000) % 100000}`;
  }

  // Everything an organizer publishes goes through moderation first.
  const created = await prisma.opportunity.create({
    data: {
      slug,
      title: d.title,
      shortDescription: d.shortDescription,
      fullDescription: d.fullDescription,
      categoryId: category.id,
      organizerId: organizer.id,
      organizerName: organizer.name,
      organizerVerified: organizer.verificationStatus,
      city: d.city,
      venue: d.venue,
      format: d.format as Format,
      price: d.price,
      minimumGrade: d.minimumGrade,
      maximumGrade: d.maximumGrade,
      applicationDeadline: d.applicationDeadline ? parseKzDateTime(d.applicationDeadline) : null,
      eventStartDate: d.eventStartDate ? parseKzDateTime(d.eventStartDate) : null,
      eventEndDate: d.eventEndDate ? parseKzDateTime(d.eventEndDate) : null,
      applicationUrl: d.applicationUrl,
      sourceUrl: d.sourceUrl,
      requirements: splitLines(d.requirements),
      prizes: d.prizes,
      tags: splitTags(d.tags),
      certificatesAvailable: d.certificatesAvailable,
      financialAidAvailable: d.financialAidAvailable,
      sourceType: "organizer",
      status: "PENDING_REVIEW",
      moderationStatus: "PENDING",
      trustScore: organizer.verificationStatus === "VERIFIED" ? 75 : 50,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "organizer_opportunity_created",
      entity: "opportunity",
      entityId: created.id,
    },
  });

  revalidatePath("/organizer/opportunities");
  redirect("/organizer/opportunities");
}

export async function updateOrganizerOpportunity(
  id: string,
  _prev: OrganizerFormState,
  formData: FormData,
): Promise<OrganizerFormState> {
  const { t } = await getT();
  const { user, organizer } = await requireOrganizer();
  const existing = await prisma.opportunity.findUnique({ where: { id } });
  if (!existing || existing.organizerId !== organizer.id) return { error: t.actB.opportunityNotFound };

  const parsed = parseOpportunityForm(formData, t);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const category = await prisma.category.findUnique({ where: { slug: d.categorySlug } });
  if (!category) return { error: t.actB.categoryNotFound };

  // Content edits to a live listing send it back to moderation.
  const wasLive = ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"].includes(existing.status);
  const contentChanged =
    existing.title !== d.title ||
    existing.shortDescription !== d.shortDescription ||
    existing.fullDescription !== d.fullDescription;

  await prisma.opportunity.update({
    where: { id },
    data: {
      title: d.title,
      shortDescription: d.shortDescription,
      fullDescription: d.fullDescription,
      categoryId: category.id,
      city: d.city,
      venue: d.venue,
      format: d.format as Format,
      price: d.price,
      minimumGrade: d.minimumGrade,
      maximumGrade: d.maximumGrade,
      applicationDeadline: d.applicationDeadline ? parseKzDateTime(d.applicationDeadline) : null,
      eventStartDate: d.eventStartDate ? parseKzDateTime(d.eventStartDate) : null,
      eventEndDate: d.eventEndDate ? parseKzDateTime(d.eventEndDate) : null,
      applicationUrl: d.applicationUrl,
      sourceUrl: d.sourceUrl,
      requirements: splitLines(d.requirements),
      prizes: d.prizes,
      tags: splitTags(d.tags),
      certificatesAvailable: d.certificatesAvailable,
      financialAidAvailable: d.financialAidAvailable,
      lastCheckedAt: new Date(),
      ...(wasLive && contentChanged
        ? { status: "PENDING_REVIEW" as OpportunityStatus, moderationStatus: "PENDING" as const }
        : {}),
    },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "organizer_opportunity_updated", entity: "opportunity", entityId: id },
  });

  revalidatePath("/organizer/opportunities");
  revalidatePath(`/organizer/opportunities/${id}`);
  return { success: true };
}

/** Organizers can only close or archive their own listings — never hard-delete. */
export async function setOrganizerOpportunityStatus(
  id: string,
  status: "CLOSED" | "ARCHIVED" | "REGISTRATION_OPEN",
): Promise<void> {
  const { user, organizer } = await requireOrganizer();
  // Server Actions are a public RPC surface — validate the status at runtime;
  // the TS union is erased and cannot stop a crafted value from reaching Prisma
  // (or from setting a live/moderated status the organizer shouldn't control).
  const parsed = z.enum(["CLOSED", "ARCHIVED", "REGISTRATION_OPEN"]).safeParse(status);
  if (!parsed.success) return;
  const next = parsed.data;

  const existing = await prisma.opportunity.findUnique({ where: { id } });
  if (!existing || existing.organizerId !== organizer.id) return;

  // Reopening is only allowed for a listing that already passed moderation.
  if (next === "REGISTRATION_OPEN" && existing.moderationStatus !== "APPROVED") return;

  await prisma.opportunity.update({ where: { id }, data: { status: next } });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "organizer_opportunity_status",
      entity: "opportunity",
      entityId: id,
      meta: { status: next },
    },
  });
  revalidatePath("/organizer/opportunities");
}
