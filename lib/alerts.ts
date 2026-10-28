import "server-only";
import { prisma } from "./prisma";
import { buildWhere, type CatalogParams } from "./queries";
import { notify } from "./notifications";
import { standardActiveOpportunityWhere } from "./public-opportunity";
import { computeMatch } from "./match";

/**
 * Two proactive-retention jobs the deadline cron calls:
 *
 *  - `runSavedSearchAlerts` — for each saved search, find opportunities created
 *    since it was last checked that still match its filters, and notify once.
 *  - `runWeeklyDigest` — a per-student summary of new matches and near deadlines.
 *
 * Both are idempotent enough to run daily: alerts advance `lastCheckedAt`, and
 * the digest is de-duplicated by a per-week notification type.
 */

const MAX_ALERTS_PER_SEARCH = 5;

export async function runInterestAlerts(now: Date = new Date()): Promise<{ students: number; alerts: number }> {
  const since = new Date(now.getTime() - 25 * 60 * 60 * 1000);
  const [students, opportunities] = await Promise.all([
    prisma.user.findMany({
      where: { role: "STUDENT", isActive: true, studentProfile: { onboardingCompleted: true, interests: { isEmpty: false } } },
      select: { id: true, studentProfile: true },
    }),
    prisma.opportunity.findMany({
      where: { ...standardActiveOpportunityWhere(now), createdAt: { gt: since } },
      include: { category: { select: { slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  let alerts = 0;

  for (const student of students) {
    const matches = opportunities
      .map((opportunity) => ({ opportunity, match: computeMatch(student.studentProfile, opportunity) }))
      .filter(({ match }) => match.eligible && match.score >= 55)
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 5);
    if (matches.length === 0) continue;

    const lead = matches[0];
    const link = `/opportunities/${lead.opportunity.slug}`;
    const exists = await prisma.notification.findFirst({
      where: { userId: student.id, type: "interest_match", link },
      select: { id: true },
    });
    if (exists) continue;

    const extra = matches.length - 1;
    await notify({
      userId: student.id,
      type: "interest_match",
      title: "Новая возможность по вашим интересам",
      body: extra > 0
        ? `${lead.opportunity.title} и ещё ${extra} подходящих возможностей.`
        : `${lead.opportunity.title} подходит вашему профилю на ${lead.match.score}%.`,
      link,
    });
    alerts++;
  }

  return { students: students.length, alerts };
}

export async function runSavedSearchAlerts(now: Date = new Date()): Promise<{ searches: number; alerts: number }> {
  const searches = await prisma.savedSearch.findMany({ where: { alertsEnabled: true } });
  let alerts = 0;

  for (const search of searches) {
    const filters = (search.filters ?? {}) as CatalogParams;
    const where = buildWhere(filters);

    const fresh = await prisma.opportunity.findMany({
      where: { ...where, createdAt: { gt: search.lastCheckedAt } },
      orderBy: { createdAt: "desc" },
      take: MAX_ALERTS_PER_SEARCH,
      select: { id: true, title: true, slug: true },
    });

    if (fresh.length > 0) {
      const lead = fresh[0];
      const extra = fresh.length - 1;
      await notify({
        userId: search.userId,
        type: "saved_search_match",
        title: `Новое по запросу «${search.name}»`,
        body:
          extra > 0
            ? `${lead.title} и ещё ${extra} — под ваш сохранённый поиск.`
            : `${lead.title} — под ваш сохранённый поиск.`,
        link: `/opportunities/${lead.slug}`,
      });
      alerts++;
    }

    // Advance the window regardless, so an empty run still moves it forward.
    await prisma.savedSearch.update({ where: { id: search.id }, data: { lastCheckedAt: now } });
  }

  return { searches: searches.length, alerts };
}

/** ISO week key like "2026-W32", used to send the digest at most once a week. */
function weekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function runWeeklyDigest(now: Date = new Date()): Promise<{ sent: number }> {
  const type = `weekly_digest_${weekKey(now)}`;
  const weekAgo = new Date(now.getTime() - 7 * 864e5);
  const soon = new Date(now.getTime() + 7 * 864e5);
  let sent = 0;

  // Only onboarded students with at least one activity signal get a digest —
  // no point emailing an empty account.
  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      isActive: true,
      studentProfile: { onboardingCompleted: true },
    },
    select: { id: true },
  });

  for (const student of students) {
    // Idempotency: skip if this week's digest already went out.
    const already = await prisma.notification.findFirst({ where: { userId: student.id, type } });
    if (already) continue;

    const [newCount, deadlines] = await Promise.all([
      prisma.opportunity.count({
        where: { ...standardActiveOpportunityWhere(now), createdAt: { gt: weekAgo } },
      }),
      prisma.application.count({
        where: {
          userId: student.id,
          status: { notIn: ["SUBMITTED", "COMPLETED", "WITHDRAWN", "REJECTED", "ACCEPTED"] },
          opportunity: { applicationDeadline: { gte: now, lte: soon } },
        },
      }),
    ]);

    if (newCount === 0 && deadlines === 0) continue;

    const parts: string[] = [];
    if (newCount > 0) parts.push(`${newCount} новых возможностей за неделю`);
    if (deadlines > 0) parts.push(`${deadlines} дедлайнов на этой неделе`);

    await notify({
      userId: student.id,
      type,
      title: "Ваша неделя на Extravity",
      body: `${parts.join(", ")}. Загляните в ленту и календарь.`,
      link: "/app",
    });
    sent++;
  }

  return { sent };
}
