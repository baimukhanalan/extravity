"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { interpolate, isLocale } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { safeReturnPath, withReturnPath } from "@/lib/safe-return-path";
import { deleteDocumentObject } from "@/lib/storage";

export type AuthState = { error?: string } | undefined;

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { t } = await getT();
  const signupSchema = z.object({
    email: z.string().email(t.actA.invalidEmail),
    password: z.string().min(8, t.actA.passwordTooShort),
    firstName: z.string().min(1, t.actA.firstNameRequired),
    lastName: z.string().min(1, t.actA.lastNameRequired),
  });
  const parsed = signupSchema.safeParse({
    email: String(formData.get("email") || "").trim().toLowerCase(),
    password: String(formData.get("password") || ""),
    firstName: String(formData.get("firstName") || "").trim(),
    lastName: String(formData.get("lastName") || "").trim(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { email, password, firstName, lastName } = parsed.data;
  const next = safeReturnPath(formData.get("next"));

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: t.actA.emailExists };

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: "STUDENT",
      studentProfile: { create: { firstName, lastName } },
    },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "signup", entity: "user", entityId: user.id },
  });

  await createSession({ userId: user.id, role: user.role, email: user.email });
  redirect(withReturnPath("/app/onboarding", next));
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { t } = await getT();
  const loginSchema = z.object({
    email: z.string().email(t.actA.invalidEmail),
    password: z.string().min(1, t.actA.passwordRequired),
  });
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") || "").trim().toLowerCase(),
    password: String(formData.get("password") || ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const next = safeReturnPath(formData.get("next"));

  const rl = await rateLimit(`login:${parsed.data.email}`, 10, 5 * 60 * 1000);
  if (!rl.ok) {
    return { error: interpolate(t.actA.tooManyLoginAttempts, { seconds: Math.ceil(rl.retryAfterMs / 1000) }) };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { studentProfile: true, organizer: { select: { id: true } }, counselorProfile: { select: { id: true } } },
  });
  if (!user || !user.isActive) return { error: t.actA.invalidCredentials };

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return { error: t.actA.invalidCredentials };

  await createSession({ userId: user.id, role: user.role, email: user.email });
  // Mirror the stored language preference so server rendering picks it up.
  if (isLocale(user.locale)) {
    const store = await cookies();
    store.set("eckz_locale", user.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  await prisma.auditLog.create({ data: { userId: user.id, action: "login", entity: "user", entityId: user.id } });

  if (["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(user.role)) redirect("/admin");

  // Accounts without a student profile belong to one of the other portals —
  // sending them through student onboarding would be a dead end.
  if (!user.studentProfile) {
    if (user.organizer) redirect("/organizer");
    if (user.counselorProfile) redirect("/counselor");
    const parentLinks = await prisma.parentStudentLink.count({
      where: { parentUserId: user.id, status: { in: ["pending", "active"] } },
    });
    if (parentLinks > 0) redirect("/parent");
  }

  if (!user.studentProfile?.onboardingCompleted) redirect(withReturnPath("/app/onboarding", next));
  if (next) redirect(next);
  redirect("/app");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

/**
 * Self-service account deletion. The schema is designed for soft-delete
 * (`User.deletedAt` + `isActive`, both already gate login and portal access), so
 * this removes the user's owned content, anonymizes remaining PII, deactivates
 * the account, and ends the session. Referential back-refs held by other people
 * (audit log, complaints, parent/counselor links) stay intact.
 */
export async function deleteAccountAction() {
  const user = await requireUser();
  const scrambled = await hashPassword(`${crypto.randomUUID()}${crypto.randomUUID()}`);
  const storedDocuments = await prisma.document.findMany({
    where: { userId: user.id, url: { not: null } },
    select: { url: true },
  });

  await Promise.all(storedDocuments.map(({ url }) => deleteDocumentObject(url!)));

  await prisma.$transaction(async (tx) => {
    await tx.savedOpportunity.deleteMany({ where: { userId: user.id } });
    await tx.savedSearch.deleteMany({ where: { userId: user.id } });
    await tx.document.deleteMany({ where: { userId: user.id } });
    await tx.achievement.deleteMany({ where: { userId: user.id } });
    await tx.opportunityReview.deleteMany({ where: { userId: user.id } });
    await tx.application.deleteMany({ where: { userId: user.id } });
    await tx.notification.deleteMany({ where: { userId: user.id } });
    await tx.pushSubscription.deleteMany({ where: { userId: user.id } });
    await tx.aiGeneration.deleteMany({ where: { userId: user.id } });

    if (user.studentProfile) {
      await tx.studentProfile.update({
        where: { userId: user.id },
        data: {
          firstName: "Удалённый",
          lastName: "пользователь",
          firstNameEn: null,
          lastNameEn: null,
          birthDate: null,
          city: null,
          school: null,
          phone: null,
          interests: [],
          skills: [],
          goals: [],
          favoriteSubjects: [],
          publicPortfolio: false,
          publicSlug: null,
        },
      });
    }

    await tx.user.update({
      where: { id: user.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        email: `deleted-${user.id}@deleted.invalid`,
        passwordHash: scrambled,
        telegramChatId: null,
        telegramLinkTokenHash: null,
        telegramLinkTokenExpiresAt: null,
        points: 0,
      },
    });

    await tx.auditLog.create({
      data: { userId: user.id, action: "account_deleted", entity: "user", entityId: user.id },
    });
  });

  await destroySession();
  const store = await cookies();
  store.delete("eckz_locale");
  redirect("/");
}
