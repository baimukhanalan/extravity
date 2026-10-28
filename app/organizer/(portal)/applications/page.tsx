import Link from "next/link";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/auth";
import { Card, Badge, Progress, EmptyState } from "@/components/ui";
import { APPLICATION_STATUS_LABELS } from "@/lib/constants";
import { interpolate } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { ORGANIZER_VISIBLE_APPLICATION_STATUSES, organizerVisibleApplicationWhere } from "@/lib/organizer-application-visibility";

/** Groups smaller than this are hidden so a cohort can't identify a single student. */
const MIN_COHORT = 3;

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.orgNav.applications };
}

export default async function OrganizerApplicationsPage() {
  const { organizer } = await requireOrganizer();
  const { t } = await getT();
  const visibleApplications = organizerVisibleApplicationWhere(organizer.id);

  const [byStatus, perOpportunity, cities] = await Promise.all([
    prisma.application.groupBy({
      by: ["status"],
      where: visibleApplications,
      _count: { _all: true },
    }),
    prisma.opportunity.findMany({
      where: { organizerId: organizer.id },
      select: {
        id: true,
        title: true,
        viewCount: true,
        saveCount: true,
        _count: { select: { applications: { where: { status: { in: ORGANIZER_VISIBLE_APPLICATION_STATUSES } } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.studentProfile.groupBy({
      by: ["city"],
      where: { user: { applications: { some: visibleApplications } } },
      _count: { _all: true },
    }),
  ]);

  const total = byStatus.reduce((sum, r) => sum + r._count._all, 0);
  const visibleCities = cities
    .filter((c) => c.city && c._count._all >= MIN_COHORT)
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 8);

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.orgNav.applications}</h1>
      <p className="mt-1 text-muted">
        {t.orgApps.subtitle}
      </p>

      {total === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title={t.orgApps.emptyTitle}
            description={t.orgApps.emptyDesc}
          />
        </div>
      ) : (
        <>
          <Card className="mt-6 p-5">
            <p className="font-medium">{interpolate(t.orgApps.funnelTotal, { total })}</p>
            <div className="mt-4 space-y-3">
              {byStatus
                .sort((a, b) => b._count._all - a._count._all)
                .map((r) => (
                  <div key={r.status}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>{APPLICATION_STATUS_LABELS[r.status] ?? r.status}</span>
                      <span className="text-muted">{r._count._all}</span>
                    </div>
                    <Progress value={(r._count._all / total) * 100} />
                  </div>
                ))}
            </div>
          </Card>

          {visibleCities.length > 0 && (
            <Card className="mt-4 p-5">
              <p className="font-medium">{t.orgApps.geography}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {visibleCities.map((c) => (
                  <Badge key={c.city} tone="neutral">{c.city}: {c._count._all}</Badge>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">
                {interpolate(t.orgApps.cohortNote, { min: MIN_COHORT })}
              </p>
            </Card>
          )}
        </>
      )}

      {perOpportunity.length > 0 && (
        <>
          <h2 className="mt-8 font-semibold">{t.orgApps.byOpportunity}</h2>
          <Card className="mt-3 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t.orgApps.thOpportunity}</th>
                <th className="px-4 py-3 font-medium">{t.orgOpps.thViews}</th>
                <th className="px-4 py-3 font-medium">{t.orgApps.thSaves}</th>
                <th className="px-4 py-3 font-medium">{t.orgNav.applications}</th>
                <th className="px-4 py-3 font-medium">{t.orgApps.thConversion}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {perOpportunity.map((o) => {
                const conversion = o.viewCount > 0 ? Math.round((o._count.applications / o.viewCount) * 100) : 0;
                return (
                  <tr key={o.id} className="hover:bg-surface-muted/50">
                    <td className="px-4 py-3">
                      <Link href={`/organizer/opportunities/${o.id}`} className="font-medium hover:text-primary">
                        {o.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{o.viewCount}</td>
                    <td className="px-4 py-3 text-muted">{o.saveCount}</td>
                    <td className="px-4 py-3 text-muted">{o._count.applications}</td>
                    <td className="px-4 py-3 text-muted">{o.viewCount > 0 ? `${conversion}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
