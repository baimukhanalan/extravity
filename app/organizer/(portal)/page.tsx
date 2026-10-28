import Link from "next/link";
import { Sparkles, Eye, Bookmark, FileText, Clock, Plus, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/auth";
import { Card, Badge, ButtonLink, EmptyState, StatCard } from "@/components/ui";
import { formatDate, deadlineLabel } from "@/lib/utils";
import { OPPORTUNITY_STATUS_LABELS } from "@/lib/constants";
import { interpolate } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import styles from "./dashboard.module.css";

export default async function OrganizerDashboard() {
  const { organizer } = await requireOrganizer();
  const { t } = await getT();

  const [live, pending, applications, agg, upcoming] = await Promise.all([
    prisma.opportunity.count({
      where: {
        organizerId: organizer.id,
        status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"] },
      },
    }),
    prisma.opportunity.count({ where: { organizerId: organizer.id, moderationStatus: "PENDING" } }),
    prisma.application.count({ where: { opportunity: { organizerId: organizer.id } } }),
    prisma.opportunity.aggregate({
      where: { organizerId: organizer.id },
      _sum: { viewCount: true, saveCount: true },
    }),
    prisma.opportunity.findMany({
      where: { organizerId: organizer.id, applicationDeadline: { gte: new Date() } },
      orderBy: { applicationDeadline: "asc" },
      take: 6,
      include: { _count: { select: { applications: true } } },
    }),
  ]);

  // Nothing with an open deadline — show the most recent listings instead.
  const recent = upcoming.length
    ? []
    : await prisma.opportunity.findMany({
        where: { organizerId: organizer.id },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { _count: { select: { applications: true } } },
      });
  const listed = upcoming.length ? upcoming : recent;

  const stats = [
    { icon: Sparkles, label: t.orgHome.statActiveOpps, value: live },
    { icon: Clock, label: t.orgHome.statModeration, value: pending, warn: pending > 0 },
    { icon: Eye, label: t.orgHome.statViews, value: agg._sum.viewCount ?? 0 },
    { icon: Bookmark, label: t.orgHome.statSaves, value: agg._sum.saveCount ?? 0 },
    { icon: FileText, label: t.orgHome.statApps, value: applications },
  ];

  return (
    <main className={styles.dashboard}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <header className={styles.hero}>
        <div>
          <h1>{organizer.name}</h1>
          <p>{t.orgNav.cabinetTitle}</p>
        </div>
        <ButtonLink href="/organizer/opportunities/new">
          <Plus className="h-4 w-4" /> {t.orgOpps.newOpp}
        </ButtonLink>
      </header>

      {organizer.verificationStatus !== "VERIFIED" && (
        <Card className={styles.notice}>
          <div className="flex gap-3">
            <TriangleAlert className="h-5 w-5 shrink-0 text-warning" />
            <div className="text-sm">
              <p className="font-medium">{t.orgHome.notVerifiedTitle}</p>
              <p className="mt-1 text-muted">
                {t.orgHome.notVerifiedText}{" "}
                <Link href="/organizer/profile" className="text-primary hover:underline">
                  {t.orgHome.notVerifiedLink}
                </Link>
                .
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className={styles.stats}>
        {stats.map((s) => (
          <StatCard key={s.label} icon={<s.icon className="h-5 w-5" />} value={s.value} label={s.label} warn={s.warn} />
        ))}
      </div>

      <section className={styles.section}>
      <h2>
        {upcoming.length ? t.orgHome.upcomingDeadlines : t.orgHome.recentOpps}
      </h2>
      <div className="mt-4">
        {listed.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title={t.orgHome.emptyTitle}
            description={t.orgHome.emptyDesc}
            action={<ButtonLink href="/organizer/opportunities/new"><Plus className="h-4 w-4" /> {t.orgOpps.create}</ButtonLink>}
          />
        ) : (
          <Card className={`${styles.list} divide-y divide-border`}>
            {listed.map((o) => {
              const dl = deadlineLabel(o.applicationDeadline);
              return (
                <Link
                  key={o.id}
                  href={`/organizer/opportunities/${o.id}`}
                  className={styles.row}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{o.title}</p>
                    <p className="text-xs text-muted">
                      {formatDate(o.applicationDeadline)} · {interpolate(t.orgHome.appsCount, { count: o._count.applications })} · {interpolate(t.orgHome.viewsCount, { count: o.viewCount })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={dl.tone}>{dl.text}</Badge>
                    <Badge tone={o.moderationStatus === "PENDING" ? "warning" : "muted"}>
                      {OPPORTUNITY_STATUS_LABELS[o.status] ?? o.status}
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
      </div>
      </section>
    </main>
  );
}
