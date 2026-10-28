import Link from "next/link";
import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireCounselor } from "@/lib/auth";
import { CounselorInviteForm } from "@/components/counselor-invite-form";
import { RevokeLinkButton } from "@/components/counselor-student-actions";
import { Card, Badge, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import styles from "../secondary.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.counsNav.students };
}

export default async function CounselorStudentsPage() {
  const { profile } = await requireCounselor();
  const { t, locale } = await getT();

  const statusView: Record<string, { tone: "success" | "warning" | "muted" | "danger"; label: string }> = {
    active: { tone: "success", label: t.counsStudents.statusActive },
    pending: { tone: "warning", label: t.counsStudents.statusPending },
    declined: { tone: "muted", label: t.counsStudents.statusDeclined },
    revoked: { tone: "muted", label: t.counsStudents.statusRevoked },
  };

  const links = await prisma.counselorStudentLink.findMany({
    where: { counselorId: profile.id },
    include: {
      student: {
        select: {
          id: true,
          email: true,
          studentProfile: { select: { firstName: true, lastName: true, grade: true, school: true, city: true } },
          _count: { select: { applications: true, achievements: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return (
    <main className={styles.page}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <header className={styles.header}>
      <h1>{t.counsNav.students}</h1>
      <p>{interpolate(t.counsStudents.activeLinks, { count: links.filter((l) => l.status === "active").length })}</p>
      </header>

      <div className={styles.invite}>
        <CounselorInviteForm locale={locale} />
      </div>

      <section className={styles.section}>
      <h2>{t.counsStudents.listHeading}</h2>
      <div className="mt-4">
        {links.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={t.counsStudents.emptyTitle}
            description={t.counsStudents.emptyDesc}
          />
        ) : (
          <Card className={`${styles.list} divide-y divide-border`}>
            {links.map((l) => {
              const view = statusView[l.status] ?? statusView.pending;
              const p = l.student?.studentProfile;
              const name = p ? `${p.firstName} ${p.lastName}`.trim() : l.studentEmail;
              const active = l.status === "active" && l.student;
              return (
                <div key={l.id} className={styles.row}>
                  <div className="min-w-0">
                    {active ? (
                      <Link href={`/counselor/students/${l.student!.id}`} className="font-medium break-words hover:text-primary">
                        {name}
                      </Link>
                    ) : (
                      <p className="font-medium break-words">{name}</p>
                    )}
                    <p className="text-xs text-muted break-words">
                      {l.studentEmail}
                      {p?.grade ? ` · ${interpolate(t.counsStudents.gradeClass, { n: p.grade })}` : ""}
                      {p?.school ? ` · ${p.school}` : ""}
                      {active ? ` · ${interpolate(t.counsStudents.appsCount, { count: l.student!._count.applications })}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      {l.acceptedAt
                        ? interpolate(t.counsStudents.acceptedOn, { date: formatDate(l.acceptedAt) })
                        : interpolate(t.counsStudents.invitedOn, { date: formatDate(l.createdAt) })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={view.tone}>{view.label}</Badge>
                    {(l.status === "active" || l.status === "pending") && <RevokeLinkButton linkId={l.id} locale={locale} />}
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
