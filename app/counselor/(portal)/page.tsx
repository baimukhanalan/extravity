import Link from "next/link";
import { Users, Clock, FileText, CalendarClock, UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireCounselor } from "@/lib/auth";
import { Card, Badge, ButtonLink, EmptyState, StatCard } from "@/components/ui";
import { daysFromNow, deadlineLabel, formatDate } from "@/lib/utils";
import { APPLICATION_STATUS_LABELS } from "@/lib/constants";
import { getT } from "@/lib/locale";
import styles from "./dashboard.module.css";

export default async function CounselorDashboard() {
  const { profile } = await requireCounselor();
  const { t } = await getT();

  const links = await prisma.counselorStudentLink.findMany({
    where: { counselorId: profile.id, status: { in: ["active", "pending"] } },
    include: {
      student: {
        select: {
          id: true,
          email: true,
          studentProfile: { select: { firstName: true, lastName: true, grade: true, school: true } },
        },
      },
    },
  });

  const active = links.filter((l) => l.status === "active" && l.student);
  const pending = links.filter((l) => l.status === "pending");
  const studentIds = active.map((l) => l.student!.id);

  const nextWeek = daysFromNow(7);
  const [applicationCount, upcoming] = await Promise.all([
    studentIds.length
      ? prisma.application.count({ where: { userId: { in: studentIds } } })
      : Promise.resolve(0),
    studentIds.length
      ? prisma.application.findMany({
          where: {
            userId: { in: studentIds },
            status: { notIn: ["WITHDRAWN", "COMPLETED", "REJECTED"] },
            opportunity: { applicationDeadline: { gte: new Date(), lte: nextWeek } },
          },
          include: {
            opportunity: { select: { title: true, slug: true, applicationDeadline: true } },
            user: { select: { id: true, email: true, studentProfile: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { opportunity: { applicationDeadline: "asc" } },
          take: 12,
        })
      : Promise.resolve([]),
  ]);

  const stats = [
    { icon: Users, label: t.counsHome.statStudents, value: active.length },
    { icon: Clock, label: t.counsHome.statPending, value: pending.length, warn: pending.length > 0 },
    { icon: FileText, label: t.counsHome.statApplications, value: applicationCount },
    { icon: CalendarClock, label: t.counsHome.statDeadlines7, value: upcoming.length, warn: upcoming.length > 0 },
  ];

  function studentName(p?: { firstName: string; lastName: string } | null, email?: string) {
    return p ? `${p.firstName} ${p.lastName}`.trim() : (email ?? t.counsHome.studentFallback);
  }

  return (
    <main className={styles.dashboard}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <header className={styles.hero}>
        <div>
          <h1>{t.counsNav.overview}</h1>
          <p>{profile.school ?? t.counsNav.cabinetTitle}</p>
        </div>
        <ButtonLink href="/counselor/students"><UserPlus className="h-4 w-4" /> {t.counsHome.inviteStudent}</ButtonLink>
      </header>

      <div className={styles.stats}>
        {stats.map((s) => (
          <StatCard key={s.label} icon={<s.icon className="h-5 w-5" />} value={s.value} label={s.label} warn={s.warn} />
        ))}
      </div>

      <section className={styles.section}>
      <h2>{t.counsHome.upcomingDeadlines}</h2>
      <div className="mt-4">
        {upcoming.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-8 w-8" />}
            title={t.counsHome.noDeadlinesTitle}
            description={
              active.length === 0
                ? t.counsHome.noDeadlinesInviteDesc
                : t.counsHome.noDeadlinesActiveDesc
            }
            action={active.length === 0 ? <ButtonLink href="/counselor/students">{t.counsHome.invite}</ButtonLink> : undefined}
          />
        ) : (
          <Card className={`${styles.list} divide-y divide-border`}>
            {upcoming.map((a) => {
              const dl = deadlineLabel(a.opportunity.applicationDeadline);
              return (
                <div key={a.id} className={styles.row}>
                  <div className="min-w-0">
                    <Link href={`/opportunities/${a.opportunity.slug}`} className="font-medium hover:text-primary">
                      {a.opportunity.title}
                    </Link>
                    <p className="text-xs text-muted">
                      <Link href={`/counselor/students/${a.user.id}`} className="hover:text-primary">
                        {studentName(a.user.studentProfile, a.user.email)}
                      </Link>{" "}
                      · {formatDate(a.opportunity.applicationDeadline)}
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
    </main>
  );
}
