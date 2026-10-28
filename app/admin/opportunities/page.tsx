import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, Badge, ButtonLink, EmptyState } from "@/components/ui";
import { OpportunityStatusSelect } from "@/components/admin-controls";
import { formatDate } from "@/lib/utils";
import { interpolate } from "@/lib/i18n";
import { getT } from "@/lib/locale";

export default async function AdminOpportunitiesPage() {
  const { t, locale } = await getT();
  const opportunities = await prisma.opportunity.findMany({
    include: { category: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t.adminOpps.title}</h1>
          <p className="mt-1 text-muted">{interpolate(t.adminOpps.recordCount, { count: opportunities.length })}</p>
        </div>
        <ButtonLink href="/admin/opportunities/new"><Plus className="h-4 w-4" /> {t.adminOpps.create}</ButtonLink>
      </div>

      {opportunities.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title={t.orgHome.emptyTitle}
            description={t.orgHome.emptyDesc}
            action={<ButtonLink href="/admin/opportunities/new"><Plus className="h-4 w-4" /> {t.adminOpps.create}</ButtonLink>}
          />
        </div>
      ) : (
        <Card className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">{t.adminOpps.thTitle}</th>
                  <th className="px-4 py-3 font-medium">{t.adminOpps.thCategory}</th>
                  <th className="px-4 py-3 font-medium">Trust</th>
                  <th className="px-4 py-3 font-medium">{t.adminOpps.thDeadline}</th>
                  <th className="px-4 py-3 font-medium">{t.adminOpps.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {opportunities.map((o) => (
                  <tr key={o.id} className="hover:bg-surface-muted/50">
                    <td className="px-4 py-3">
                      {o.moderationStatus === "APPROVED"
                        ? <Link href={`/opportunities/${o.slug}`} className="font-medium hover:text-primary">{o.title}</Link>
                        : <span className="font-medium">{o.title}</span>}
                      <p className="text-xs text-muted">{o.organizerName}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">{o.category.nameRu}</td>
                    <td className="px-4 py-3">
                      <Badge tone={o.trustScore >= 70 ? "success" : o.trustScore >= 45 ? "warning" : "danger"}>{o.trustScore}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(o.applicationDeadline)}</td>
                    <td className="px-4 py-3"><OpportunityStatusSelect id={o.id} status={o.status} locale={locale} /></td>
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
