import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Self-service data export (GDPR / ПДн "right of access"). Streams the signed-in
 * user's own personal data as a downloadable JSON file. Document rows are
 * included as metadata only — not the stored file bytes.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.isActive) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const [profile, applications, saved, savedSearches, documents, achievements, reviews, notifications, notifPref, subscription, consents] =
    await Promise.all([
      prisma.studentProfile.findUnique({ where: { userId: user.id } }),
      prisma.application.findMany({
        where: { userId: user.id },
        include: { opportunity: { select: { title: true } }, comments: true, statusHistory: true },
      }),
      prisma.savedOpportunity.findMany({
        where: { userId: user.id },
        include: { opportunity: { select: { title: true } } },
      }),
      prisma.savedSearch.findMany({ where: { userId: user.id } }),
      prisma.document.findMany({ where: { userId: user.id } }),
      prisma.achievement.findMany({ where: { userId: user.id } }),
      prisma.opportunityReview.findMany({ where: { userId: user.id } }),
      prisma.notification.findMany({ where: { userId: user.id } }),
      prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
      prisma.subscription.findUnique({ where: { userId: user.id }, include: { plan: true } }),
      prisma.parentConsent.findMany({ where: { studentUserId: user.id } }),
    ]);

  const data = {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      role: user.role,
      locale: user.locale,
      createdAt: user.createdAt,
    },
    profile,
    applications,
    saved,
    savedSearches,
    documents,
    achievements,
    reviews,
    notifications,
    notificationPreference: notifPref,
    subscription,
    consents,
  };

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="extracurriculars-kz-${user.id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
