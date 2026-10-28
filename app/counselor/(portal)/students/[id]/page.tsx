import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Award, FileText, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireCounselor } from "@/lib/auth";
import { getFeed } from "@/lib/recommendations";
import { RecommendButton } from "@/components/counselor-recommend-button";
import { ApplicationComments } from "@/components/application-comments";
import { Card, Badge, Progress, EmptyState } from "@/components/ui";
import { APPLICATION_STATUS_LABELS, ACHIEVEMENT_TYPE_LABELS, INTERESTS, GOALS } from "@/lib/constants";
import { deadlineLabel, formatDate } from "@/lib/utils";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import styles from "../../secondary.module.css";

export default async function CounselorStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, profile } = await requireCounselor();
  const { t, locale } = await getT();

  // Access is the active link, never the id alone.
  const link = await prisma.counselorStudentLink.findFirst({
    where: { counselorId: profile.id, studentUserId: id, status: "active" },
  });
  if (!link) notFound();

  const student = await prisma.user.findUnique({
    where: { id },
    include: {
      studentProfile: true,
      applications: {
        include: {
          opportunity: { select: { title: true, slug: true, applicationDeadline: true } },
          comments: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { email: true, studentProfile: { select: { firstName: true, lastName: true } } } } },
          },
        },
        orderBy: { updatedAt: "desc" },
      },
      achievements: { orderBy: { date: "desc" }, take: 10 },
    },
  });
  if (!student) notFound();

  const p = student.studentProfile;
  const name = p ? `${p.firstName} ${p.lastName}`.trim() : student.email;
  const { sections } = await getFeed(p);
  const label = (list: { key: string; label: string }[], key: string) =>
    list.find((i) => i.key === key)?.label ?? key;
  const suggestions = sections.find((s) => s.key === "recommended")?.items.slice(0, 4) ?? [];

  return (
    <main className={styles.page}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <Link href="/counselor/students" className={styles.back}>
        <ArrowLeft className="h-4 w-4" /> {t.counsStudents.backToList}
      </Link>

      <header className={styles.header}>
      <h1>{name}</h1>
      <p>
        {[p?.grade ? interpolate(t.counsStudents.gradeClass, { n: p.grade }) : null, p?.school, p?.city].filter(Boolean).join(" · ") || student.email}
      </p>
      </header>

      {p && (p.interests.length > 0 || p.goals.length > 0) && (
        <Card className={styles.interests}>
          {p.interests.length > 0 && (
            <div>
              <p className="text-sm font-medium">{t.counsStudents.interests}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.interests.map((i) => <Badge key={i} tone="primary">{label(INTERESTS, i)}</Badge>)}
              </div>
            </div>
          )}
          {p.goals.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium">{t.counsStudents.goals}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.goals.map((g) => <Badge key={g} tone="neutral">{label(GOALS, g)}</Badge>)}
              </div>
            </div>
          )}
        </Card>
      )}

      <section className={styles.section}>
      <h2>
        <FileText className="h-5 w-5 text-muted" /> {interpolate(t.counsStudents.applicationsCount, { count: student.applications.length })}
      </h2>
      <div className="mt-4">
        {student.applications.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} title={t.counsStudents.noApplications} />
        ) : (
          <Card className={`${styles.list} divide-y divide-border`}>
            {student.applications.map((a) => {
              const dl = deadlineLabel(a.opportunity.applicationDeadline);
              return (
                <div key={a.id} className={styles.applicationRow}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/opportunities/${a.opportunity.slug}`} className="font-medium hover:text-primary">
                      {a.opportunity.title}
                    </Link>
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">{APPLICATION_STATUS_LABELS[a.status] ?? a.status}</Badge>
                      <Badge tone={dl.tone}>{dl.text}</Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <Progress value={a.progress} className="max-w-xs" />
                    <span className="text-xs text-muted">{a.progress}%</span>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-primary">
                      {interpolate(t.counsStudents.commentsCount, { count: a.comments.length })}
                    </summary>
                    <div className="mt-2">
                      <ApplicationComments
                        applicationId={a.id}
                        comments={a.comments.map((c) => ({
                          id: c.id,
                          body: c.body,
                          authorRole: c.authorRole,
                          authorName: c.author.studentProfile
                            ? `${c.author.studentProfile.firstName} ${c.author.studentProfile.lastName}`.trim()
                            : c.author.email,
                          createdAt: c.createdAt.toISOString(),
                          own: c.authorUserId === user.id,
                        }))}
                      />
                    </div>
                  </details>
                </div>
              );
            })}
          </Card>
        )}
      </div>
      </section>

      <section className={styles.section}>
      <h2>
        <Award className="h-5 w-5 text-muted" /> {t.counsStudents.achievements}
      </h2>
      <div className="mt-4">
        {student.achievements.length === 0 ? (
          <EmptyState icon={<Award className="h-8 w-8" />} title={t.counsStudents.noAchievements} />
        ) : (
          <Card className={`${styles.list} divide-y divide-border`}>
            {student.achievements.map((a) => (
              <div key={a.id} className={styles.row}>
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-muted">
                    {[a.organization, a.result, formatDate(a.date)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Badge tone="neutral">{ACHIEVEMENT_TYPE_LABELS[a.type] ?? a.type}</Badge>
              </div>
            ))}
          </Card>
        )}
      </div>
      </section>

      {suggestions.length > 0 && (
        <section className={styles.section}>
          <h2>
            <Sparkles className="h-5 w-5 text-muted" /> {t.counsStudents.suggestions}
          </h2>
          <Card className={`${styles.list} divide-y divide-border`}>
            {suggestions.map((s) => (
              <div key={s.opp.id} className={styles.row}>
                <div className="min-w-0">
                  <Link href={`/opportunities/${s.opp.slug}`} className="font-medium hover:text-primary">
                    {s.opp.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {s.opp.category.nameRu} · {interpolate(t.counsStudents.matchScore, { score: s.match.score })}
                  </p>
                </div>
                <RecommendButton studentUserId={student.id} opportunityId={s.opp.id} locale={locale} />
              </div>
            ))}
          </Card>
        </section>
      )}
    </main>
  );
}
