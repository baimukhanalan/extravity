import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/auth";
import { Card, Badge, ButtonLink, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { OPPORTUNITY_STATUS_LABELS } from "@/lib/constants";
import { interpolate } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import styles from "../organizer-sections.module.css";

const statusTone: Record<string, "success" | "warning" | "danger" | "muted" | "neutral"> = {
  PUBLISHED: "success",
  REGISTRATION_OPEN: "success",
  DEADLINE_SOON: "warning",
  PENDING_REVIEW: "warning",
  DRAFT: "muted",
  CLOSED: "muted",
  ARCHIVED: "muted",
  COMPLETED: "muted",
  REJECTED: "danger",
  SUSPICIOUS: "danger",
};

export default async function OrganizerOpportunitiesPage() {
  const { organizer } = await requireOrganizer();
  const { t } = await getT();
  const opportunities = await prisma.opportunity.findMany({
    where: { organizerId: organizer.id },
    include: { category: true, _count: { select: { applications: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1>{t.orgNav.myOpps}</h1>
          <p className="mt-1 text-muted">{interpolate(t.orgOpps.recordCount, { count: opportunities.length })}</p>
        </div>
        <ButtonLink href="/organizer/opportunities/new"><Plus className="h-4 w-4" /> {t.orgOpps.create}</ButtonLink>
      </header>

      {opportunities.length === 0 ? (
        <div>
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title={t.orgOpps.emptyTitle}
            description={t.orgOpps.emptyDesc}
            action={<ButtonLink href="/organizer/opportunities/new"><Plus className="h-4 w-4" /> {t.orgOpps.create}</ButtonLink>}
          />
        </div>
      ) : (
        <Card className={styles.tableWrap}>
          <div className="overflow-x-auto">
            <table className={styles.table}>
              <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">{t.orgOpps.thTitle}</th>
                  <th className="px-4 py-3 font-medium">{t.orgOpps.thCategory}</th>
                  <th className="px-4 py-3 font-medium">{t.orgOpps.thDeadline}</th>
                  <th className="px-4 py-3 font-medium">{t.orgOpps.thViews}</th>
                  <th className="px-4 py-3 font-medium">{t.orgNav.applications}</th>
                  <th className="px-4 py-3 font-medium">{t.orgOpps.thStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {opportunities.map((o) => (
                  <tr key={o.id} className="hover:bg-surface-muted/50">
                    <td className="px-4 py-3">
                      <Link href={`/organizer/opportunities/${o.id}`} className={styles.tableLink}>
                        {o.title}
                      </Link>
                      <p className="text-xs text-muted">{o.city ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">{o.category.nameRu}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(o.applicationDeadline)}</td>
                    <td className="px-4 py-3 text-muted">{o.viewCount}</td>
                    <td className="px-4 py-3 text-muted">{o._count.applications}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone[o.status] ?? "neutral"}>
                        {OPPORTUNITY_STATUS_LABELS[o.status] ?? o.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
