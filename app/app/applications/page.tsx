import Link from "next/link";
import { FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, Badge, Progress, EmptyState, ButtonLink } from "@/components/ui";
import { APPLICATION_STATUS_LABELS } from "@/lib/constants";
import { deadlineLabel } from "@/lib/utils";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import { applicationHistoryWhere, partitionApplicationsByAvailability } from "@/lib/application-list-state";
import styles from "../portal-pages.module.css";

const statusTone: Record<string, "neutral" | "primary" | "success" | "warning" | "danger" | "muted"> = {
  ACCEPTED: "success",
  SUBMITTED: "primary",
  INTERVIEW: "primary",
  READY_TO_SUBMIT: "success",
  READY_FOR_REVIEW: "warning",
  DOCUMENTS_MISSING: "warning",
  REJECTED: "danger",
  WITHDRAWN: "muted",
  COMPLETED: "success",
};

export default async function ApplicationsPage() {
  const { t } = await getT();
  const user = await requireUser();
  const apps = await prisma.application.findMany({
    where: applicationHistoryWhere(user.id),
    include: { opportunity: { include: { category: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const { current, historical } = partitionApplicationsByAvailability(apps);

  function renderApplication(a: (typeof apps)[number], historicalEntry: boolean) {
    const dl = deadlineLabel(a.opportunity.applicationDeadline);
    return (
      <Link key={a.id} href={`/app/applications/${a.id}`} className={styles.applicationLink}>
        <Card className={`${styles.applicationCard} ${historicalEntry ? "opacity-70" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{a.opportunity.title}</p>
              <p className="mt-0.5 text-xs text-muted">{a.opportunity.category.nameRu}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {historicalEntry && <Badge tone="muted">{t.applications.historicalBadge}</Badge>}
              <Badge tone={statusTone[a.status] ?? "neutral"}>{APPLICATION_STATUS_LABELS[a.status]}</Badge>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Progress value={a.progress} className="flex-1" />
            <span className="text-xs font-medium text-muted">{a.progress}%</span>
          </div>
          <div className="mt-2 text-xs text-muted">{dl.text}</div>
        </Card>
      </Link>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{t.applications.title}</h1>
          <p className={styles.subtitle}>{interpolate(t.applications.inProgressCount, { count: current.length })}</p>
        </div>
      </div>

      <div className={styles.storySection}>
        {apps.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title={t.applications.emptyTitle}
            description={t.applications.emptyDescription}
            action={<ButtonLink href="/app/discover">{t.applications.findOpportunities}</ButtonLink>}
          />
        ) : (
          <div className="space-y-8">
            {current.length > 0 && <div className={styles.applicationList}>{current.map((a) => renderApplication(a, false))}</div>}
            {historical.length > 0 && (
              <section aria-label={t.applications.historicalTitle}>
                <h2 className="text-lg font-semibold">{t.applications.historicalTitle}</h2>
                <p className="mb-3 mt-1 text-sm text-muted">{t.applications.historicalHint}</p>
                <div className={styles.applicationList}>{historical.map((a) => renderApplication(a, true))}</div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
