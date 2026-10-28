"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { track } from "@/lib/observability";
import { safeReturnPath } from "@/lib/safe-return-path";

const onboardingSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: z.string().optional(),
  city: z.string().optional(),
  school: z.string().optional(),
  grade: z.coerce.number().int().min(1).max(12).optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{10,20}$/).optional().or(z.literal("")),
  interests: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  goals: z.array(z.string()).default([]),
  maxBudget: z.coerce.number().int().min(0).optional(),
  willingToTravel: z.boolean().default(false),
  onlineOnly: z.boolean().default(false),
  hasPassport: z.boolean().default(false),
  preferredLanguages: z.array(z.string()).default([]),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export async function completeOnboarding(input: OnboardingInput, returnPath?: string | null) {
  const user = await requireUser();
  const { t } = await getT();
  const data = onboardingSchema.parse(input);

  await prisma.studentProfile.update({
    where: { userId: user.id },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      city: data.city || null,
      school: data.school || null,
      grade: data.grade ?? null,
      phone: data.phone || null,
      interests: data.interests,
      skills: data.skills,
      goals: data.goals,
      maxBudget: data.maxBudget ?? null,
      willingToTravel: data.willingToTravel,
      onlineOnly: data.onlineOnly,
      hasPassport: data.hasPassport,
      preferredLanguages: data.preferredLanguages,
      onboardingCompleted: true,
      onboardingStep: 6,
    },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "onboarding_completed", entity: "student_profile" },
  });
  await track("onboarding_completed", user.id, { grade: data.grade, city: data.city });

  // Seed a welcome notification.
  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "welcome",
      title: t.actA.profileReadyTitle,
      body: t.actA.profileReadyBody,
      link: "/app",
    },
  });

  redirect(safeReturnPath(returnPath) ?? "/app");
}

export async function updateProfile(input: Partial<OnboardingInput>) {
  const user = await requireUser();
  const data = onboardingSchema.partial().parse(input);
  await prisma.studentProfile.update({
    where: { userId: user.id },
    data: {
      ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
      ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
      ...(data.birthDate !== undefined ? { birthDate: data.birthDate ? new Date(data.birthDate) : null } : {}),
      ...(data.city !== undefined ? { city: data.city || null } : {}),
      ...(data.school !== undefined ? { school: data.school || null } : {}),
      ...(data.grade !== undefined ? { grade: data.grade ?? null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      ...(data.interests !== undefined ? { interests: data.interests } : {}),
      ...(data.skills !== undefined ? { skills: data.skills } : {}),
      ...(data.goals !== undefined ? { goals: data.goals } : {}),
      ...(data.maxBudget !== undefined ? { maxBudget: data.maxBudget ?? null } : {}),
      ...(data.willingToTravel !== undefined ? { willingToTravel: data.willingToTravel } : {}),
      ...(data.onlineOnly !== undefined ? { onlineOnly: data.onlineOnly } : {}),
      ...(data.hasPassport !== undefined ? { hasPassport: data.hasPassport } : {}),
      ...(data.preferredLanguages !== undefined ? { preferredLanguages: data.preferredLanguages } : {}),
    },
  });
  revalidatePath("/app/profile");
  revalidatePath("/app");
}

const LOCALES = ["ru", "kk", "en"] as const;

export async function setLocale(locale: string) {
  const user = await requireUser();
  if (!LOCALES.includes(locale as (typeof LOCALES)[number])) return;

  await prisma.user.update({ where: { id: user.id }, data: { locale } });

  // Mirrored into a cookie so public pages can localize without a DB read.
  const store = await cookies();
  store.set("eckz_locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  revalidatePath("/", "layout");
}

const preferencesSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  telegram: z.boolean(),
  quietHoursStart: z.coerce.number().int().min(0).max(23).nullable(),
  quietHoursEnd: z.coerce.number().int().min(0).max(23).nullable(),
});

export type NotificationPreferencesInput = z.infer<typeof preferencesSchema>;

export async function updateNotificationPreferences(input: NotificationPreferencesInput) {
  const user = await requireUser();
  const data = preferencesSchema.parse(input);

  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  revalidatePath("/app/settings");
}

/** Unlinks the Telegram chat from this account (the bot side uses /stop). */
export async function disconnectTelegram() {
  const user = await requireUser();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        telegramChatId: null,
        telegramLinkTokenHash: null,
        telegramLinkTokenExpiresAt: null,
      },
    }),
    prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, telegram: false },
      update: { telegram: false },
    }),
  ]);
  revalidatePath("/app/settings");
}
