import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireParent } from "@/lib/auth";
import { Card, Badge, EmptyState } from "@/components/ui";
import { deadlineLabel, formatDate, formatKzt } from "@/lib/utils";
import { APPLICATION_STATUS_LABELS } from "@/lib/constants";
import { getT } from "@/lib/locale";
import { isOpportunityPriceKnown } from "@/lib/opportunity-price";
import styles from "../secondary.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.parentNav.deadlines };
}

export default async function ParentDeadlinesPage() {
  const { t } = await getT();
  const { links } = await requireParent();
  const studentIds = links.map((l) => l.studentUserId);

  const applications = await prisma.application.findMany({
    where: {
      userId: { in: studentIds },
      status: { notIn: ["WITHDRAWN", "COMPLETED", "REJECTED"] },
      opportunity: { applicationDeadline: { gte: new Date() } },
    },
    include: {
      opportunity: {
        select: { title: true, slug: true, applicationDeadline: true, price: true, sourceType: true, fullDescription: true, shortDescription: true, city: true, format: true },
      },
      user: { select: { id: true, email: true, studentProfile: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { opportunity: { applicationDeadline: "asc" } },
  });

  return (
    <main className={styles.page}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <header className={styles.header}>
      <h1>{t.parentNav.deadlines}</h1>
      <p>{t.parentDeadlines.subtitle}</p>
      </header>

      <div className={styles.content}>
        {applications.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-8 w-8" />}
            title={t.parentDeadlines.emptyTitle}
            description={t.parentDeadlines.emptyDesc}
          />
        ) : (
          <Card className={`${styles.list} divide-y divide-border`}>
            {applications.map((a) => {
              const dl = deadlineLabel(a.opportunity.applicationDeadline);
              const p = a.user.studentProfile;
              return (
                <div key={a.id} className={styles.row}>
                  <div className="min-w-0">
                    <Link href={`/opportunities/${a.opportunity.slug}`} className="font-medium hover:text-primary">
                      {a.opportunity.title}
                    </Link>
                    <p className="text-xs text-muted">
                      {p ? `${p.firstName} ${p.lastName}`.trim() : a.user.email} ·{" "}
                      {formatDate(a.opportunity.applicationDeadline)} ·{" "}
                      {a.opportunity.city ?? (a.opportunity.format === "ONLINE" ? t.parentDeadlines.online : "—")} ·{" "}
                      {isOpportunityPriceKnown(a.opportunity) ? formatKzt(a.opportunity.price) : t.common.priceUnknown}
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
    </main>
  );
}
