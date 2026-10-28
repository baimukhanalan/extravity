import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { captureError } from "@/lib/observability";
import { safeEqual } from "@/lib/timing-safe";
import { runInterestAlerts, runSavedSearchAlerts, runWeeklyDigest } from "@/lib/alerts";
import { DEFAULT_LOCALE, getDictionary, interpolate, isLocale } from "@/lib/i18n";
import { archiveEligibleWhere, recentlyExpiredWhere } from "@/lib/opportunity-freshness";
import { cleanupUnusedTelegramArchiveMedia } from "@/lib/telegram-media-retention";

export const dynamic = "force-dynamic";

const BUCKETS = [14, 7, 3, 1];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Auto-refresh opportunity freshness by deadline. Published opportunities move
 * PUBLISHED/REGISTRATION_OPEN → DEADLINE_SOON (≤7 days) → CLOSED (passed) →
 * ARCHIVED (10 days after the deadline).
 * Only touches auto-managed statuses, never DRAFT/
 * PENDING_REVIEW/SUSPICIOUS/REJECTED/COMPLETED. Also stamps lastCheckedAt.
 */
async function refreshStatuses() {
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 864e5);

  const [archived, closed, deadlineSoon, reopened] = await prisma.$transaction([
    prisma.opportunity.updateMany({
      where: archiveEligibleWhere(now),
      data: { status: "ARCHIVED", lastCheckedAt: now },
    }),
    prisma.opportunity.updateMany({
      where: recentlyExpiredWhere(now),
      data: { status: "CLOSED", lastCheckedAt: now },
    }),
    prisma.opportunity.updateMany({
      where: { status: { in: ["PUBLISHED", "REGISTRATION_OPEN"] }, applicationDeadline: { gte: now, lte: soon } },
      data: { status: "DEADLINE_SOON", lastCheckedAt: now },
    }),
    prisma.opportunity.updateMany({
      where: { status: "DEADLINE_SOON", applicationDeadline: { gt: soon } },
      data: { status: "REGISTRATION_OPEN", lastCheckedAt: now },
    }),
  ]);

  return { closed: closed.count, deadlineSoon: deadlineSoon.count, reopened: reopened.count, archived: archived.count };
}

async function refreshScheduledPrices(now: Date) {
  if (now < new Date("2026-10-01T04:00:00.000Z")) return 0;
  const updated = await prisma.opportunity.updateMany({
    where: { slug: "harvard-student-agencies-case-competition-2026", currency: "USD", price: 10, status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"] } },
    data: { price: 15, lastCheckedAt: now },
  });
  return updated.count;
}

/**
 * Daily maintenance (Vercel Cron, see vercel.json):
 * 1) refresh opportunity statuses by deadline (auto-currency);
 * 2) send deadline reminders (14/7/3/1 days) to saved/applied users.
 * Idempotent per day per opportunity.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
  // configured. Fail closed when absent. Do NOT trust the `x-vercel-cron` header — it is
  // client-supplied and trivially spoofable, which would let anyone trigger the
  // catalog-mutating cron.
  if (!secret || !safeEqual(auth ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await runCron();
  } catch (e) {
    // A cron that dies silently is a cron you find out about weeks later.
    await captureError(e, { where: "cron/deadlines" });
    return NextResponse.json({ ok: false, error: "cron failed" }, { status: 500 });
  }
}

async function runCron() {
  const statusChanges = await refreshStatuses();
  const mediaCleanup = await cleanupUnusedTelegramArchiveMedia();
  const scheduledPricesUpdated = await refreshScheduledPrices(new Date());

  const today = startOfDay(new Date());
  let sent = 0;

  for (const days of BUCKETS) {
    const from = new Date(today);
    from.setDate(from.getDate() + days);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    // Users who saved or applied to opportunities with a deadline in this bucket.
    const saved = await prisma.savedOpportunity.findMany({
      where: { opportunity: { applicationDeadline: { gte: from, lt: to } } },
      include: {
        opportunity: { select: { id: true, title: true, slug: true } },
        user: { select: { locale: true } },
      },
    });
    const applied = await prisma.application.findMany({
      where: {
        opportunity: { applicationDeadline: { gte: from, lt: to } },
        status: { notIn: ["SUBMITTED", "COMPLETED", "WITHDRAWN", "REJECTED", "ACCEPTED"] },
      },
      include: {
        opportunity: { select: { id: true, title: true, slug: true } },
        user: { select: { locale: true } },
      },
    });

    const pairs = new Map<
      string,
      { userId: string; locale: string; opp: { id: string; title: string; slug: string } }
    >();
    for (const s of saved)
      pairs.set(`${s.userId}:${s.opportunity.id}`, { userId: s.userId, locale: s.user.locale, opp: s.opportunity });
    for (const a of applied)
      pairs.set(`${a.userId}:${a.opportunity.id}`, { userId: a.userId, locale: a.user.locale, opp: a.opportunity });

    for (const { userId, locale, opp } of pairs.values()) {
      const link = `/opportunities/${opp.slug}`;
      // Idempotency: skip if a reminder for this bucket already exists today.
      const exists = await prisma.notification.findFirst({
        where: { userId, type: `deadline_${days}`, link, createdAt: { gte: today } },
      });
      if (exists) continue;

      const d = getDictionary(isLocale(locale) ? locale : DEFAULT_LOCALE);
      await notify({
        userId,
        type: `deadline_${days}`,
        title: days === 1 ? d.apiMsg.deadlineTomorrowTitle : interpolate(d.apiMsg.deadlineSoonTitle, { days }),
        body: interpolate(d.apiMsg.deadlineReminderBody, { title: opp.title }),
        link,
      });
      sent++;
    }
  }

  // Proactive retention: new-match alerts daily, digest once a week (Mondays).
  const [alerts, interestAlerts] = await Promise.all([
    runSavedSearchAlerts(new Date()),
    runInterestAlerts(new Date()),
  ]);
  const digest = today.getDay() === 1 ? await runWeeklyDigest(new Date()) : { sent: 0 };

  return NextResponse.json({ ok: true, statusChanges, mediaCleanup, scheduledPricesUpdated, remindersSent: sent, alerts, interestAlerts, digest });
}
