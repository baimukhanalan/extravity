import Link from "next/link";
import { Users, FileText, CalendarClock, Wallet, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireParent } from "@/lib/auth";
import { Card, Badge, ButtonLink, EmptyState, StatCard } from "@/components/ui";
import { daysFromNow, deadlineLabel, formatDate, formatKzt } from "@/lib/utils";
import { APPLICATION_STATUS_LABELS } from "@/lib/constants";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import styles from "./dashboard.module.css";

export default async function ParentDashboard() {
  const { t } = await getT();
  const { links } = await requireParent();
  const studentIds = links.map((l) => l.studentUserId);

  const nextMonth = daysFromNow(30);
  const [applications, paidApplications] = await Promise.all([
    prisma.application.findMany({
      where: {
        userId: { in: studentIds },
        status: { notIn: ["WITHDRAWN", "COMPLETED", "REJECTED"] },
        opportunity: { applicationDeadline: { gte: new Date(), lte: nextMonth } },
      },
      include: {
        opportunity: { select: { title: true, slug: true, applicationDeadline: true, price: true } },
        user: { select: { id: true, studentProfile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { opportunity: { applicationDeadline: "asc" } },
      take: 10,
    }),
    prisma.application.findMany({
      where: { userId: { in: studentIds }, opportunity: { price: { gt: 0 } } },
      select: { opportunity: { select: { price: true } } },
    }),
  ]);

  const plannedSpend = paidApplications.reduce((sum, a) => sum + a.opportunity.price, 0);
  const consentsPending = links.filter((l) => l.consents.every((c) => !c.granted)).length;

  const stats = [
    { icon: Users, label: t.parentHome.statChildren, value: links.length },
    { icon: CalendarClock, label: t.parentHome.statDeadlines30, value: applications.length },
    // formatKzt renders 0 as "Бесплатно", which reads wrong for a running total.
    { icon: Wallet, label: t.parentHome.statPlannedSpend, value: plannedSpend === 0 ? "0 ₸" : formatKzt(plannedSpend) },
    { icon: ShieldCheck, label: t.parentHome.statPendingConsent, value: consentsPending, warn: consentsPending > 0 },
  ];

  function childName(p?: { firstName: string; lastName: string } | null) {
    return p ? `${p.firstName} ${p.lastName}`.trim() : t.parentHome.childFallbackName;
  }

  return (
    <main className={styles.dashboard}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <header className={styles.hero}>
        <h1>{t.parentNav.overview}</h1>
        <p>{t.parentHome.subtitle}</p>
      </header>

      <div className={styles.stats}>
        {stats.map((s) => (
          <StatCard key={s.label} icon={<s.icon className="h-5 w-5" />} value={s.value} label={s.label} warn={s.warn} />
        ))}
      </div>

      <section className={styles.section}>
      <h2>{t.parentHome.childrenHeading}</h2>
      <Card className={`${styles.list} divide-y divide-border`}>
        {links.map((l) => {
          const granted = l.consents.filter((c) => c.granted).length;
          return (
            <div key={l.id} className={styles.row}>
              <div>
                <p className="font-medium">{childName(l.student.studentProfile)}</p>
                <p className="text-xs text-muted">
                  {l.student.studentProfile?.school ?? l.student.email}
                  {l.student.studentProfile?.grade
                    ? ` · ${interpolate(t.parentHome.gradeLabel, { grade: l.student.studentProfile.grade })}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={granted > 0 ? "success" : "warning"}>
                  {interpolate(t.parentHome.consentsCount, { granted, total: l.consents.length })}
                </Badge>
                <ButtonLink href="/parent/consents" variant="outline" size="sm">{t.parentHome.manage}</ButtonLink>
              </div>
            </div>
          );
        })}
      </Card>
      </section>

      <section className={styles.section}>
      <h2>{t.parentHome.upcomingDeadlines}</h2>
      <div className="mt-4">
        {applications.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title={t.parentHome.deadlinesEmptyTitle}
            description={t.parentHome.deadlinesEmptyDesc}
          />
        ) : (
          <Card className={`${styles.list} divide-y divide-border`}>
            {applications.map((a) => {
              const dl = deadlineLabel(a.opportunity.applicationDeadline);
              return (
                <div key={a.id} className={styles.row}>
                  <div className="min-w-0">
                    <Link href={`/opportunities/${a.opportunity.slug}`} className="font-medium hover:text-primary">
                      {a.opportunity.title}
                    </Link>
                    <p className="text-xs text-muted">
                      {childName(a.user.studentProfile)} · {formatDate(a.opportunity.applicationDeadline)}
                      {a.opportunity.price > 0 ? ` · ${formatKzt(a.opportunity.price)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{APPLICATION_STATUS_LABELS[a.status] ?? a.status}</Badge>
                    <Badge tone={dl.tone}>{dl.text}</Badge>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
      </section>

      <p className={styles.visibility}>
        {t.parentHome.visibilityNote}
      </p>
    </main>
  );
}
