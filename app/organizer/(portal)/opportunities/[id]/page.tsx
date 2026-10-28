import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Bookmark, FileText, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/auth";
import { updateOrganizerOpportunity } from "@/app/actions/organizer";
import { OrganizerOpportunityForm } from "@/components/organizer-opportunity-form";
import { OrganizerOpportunityActions } from "@/components/organizer-opportunity-actions";
import { Card, Badge, StatCard } from "@/components/ui";
import { OPPORTUNITY_STATUS_LABELS, APPLICATION_STATUS_LABELS } from "@/lib/constants";
import { toKzDateTimeInput } from "@/lib/utils";
import { getT } from "@/lib/locale";

export default async function OrganizerOpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizer } = await requireOrganizer();
  const { t, locale } = await getT();

  const opportunity = await prisma.opportunity.findFirst({
    where: { id, organizerId: organizer.id },
    include: { category: true },
  });
  if (!opportunity) notFound();

  const byStatus = await prisma.application.groupBy({
    by: ["status"],
    where: { opportunityId: opportunity.id },
    _count: { _all: true },
  });
  const totalApplications = byStatus.reduce((sum, r) => sum + r._count._all, 0);

  const boundAction = updateOrganizerOpportunity.bind(null, opportunity.id);
  const isLive = ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"].includes(opportunity.status);

  return (
    <div>
      <Link href="/organizer/opportunities" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t.orgOpps.backToList}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{opportunity.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-muted">
            <Badge tone={isLive ? "success" : opportunity.moderationStatus === "PENDING" ? "warning" : "muted"}>
              {OPPORTUNITY_STATUS_LABELS[opportunity.status] ?? opportunity.status}
            </Badge>
            <span className="text-sm">{opportunity.category.nameRu}</span>
            {isLive && (
              <Link
                href={`/opportunities/${opportunity.slug}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {t.orgOpps.openInCatalog} <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </p>
        </div>
        <OrganizerOpportunityActions
          id={opportunity.id}
          status={opportunity.status}
          canReopen={opportunity.moderationStatus === "APPROVED"}
          locale={locale}
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Eye, label: t.orgHome.statViews, value: opportunity.viewCount },
          { icon: Bookmark, label: t.orgHome.statSaves, value: opportunity.saveCount },
          { icon: FileText, label: t.orgHome.statApps, value: totalApplications },
        ].map((s) => (
          <StatCard key={s.label} icon={<s.icon className="h-5 w-5" />} value={s.value} label={s.label} />
        ))}
      </div>

      {byStatus.length > 0 && (
        <Card className="mt-4 p-4">
          <p className="text-sm font-medium">{t.orgOpps.appsByStatus}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {byStatus.map((r) => (
              <Badge key={r.status} tone="neutral">
                {APPLICATION_STATUS_LABELS[r.status] ?? r.status}: {r._count._all}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            {t.orgOpps.privacyNote}
          </p>
        </Card>
      )}

      <h2 className="mt-8 font-semibold">{t.orgOpps.editHeading}</h2>
      <div className="mt-3">
        <OrganizerOpportunityForm
          action={boundAction}
          submitLabel={t.orgOpps.save}
          locale={locale}
          defaults={{
            title: opportunity.title,
            shortDescription: opportunity.shortDescription,
            fullDescription: opportunity.fullDescription,
            categorySlug: opportunity.category.slug,
            city: opportunity.city,
            venue: opportunity.venue,
            format: opportunity.format,
            price: opportunity.price,
            minimumGrade: opportunity.minimumGrade,
            maximumGrade: opportunity.maximumGrade,
            applicationDeadline: toKzDateTimeInput(opportunity.applicationDeadline),
            eventStartDate: toKzDateTimeInput(opportunity.eventStartDate),
            eventEndDate: toKzDateTimeInput(opportunity.eventEndDate),
            applicationUrl: opportunity.applicationUrl,
            sourceUrl: opportunity.sourceUrl,
            requirements: opportunity.requirements,
            prizes: opportunity.prizes,
            tags: opportunity.tags,
            certificatesAvailable: opportunity.certificatesAvailable,
            financialAidAvailable: opportunity.financialAidAvailable,
          }}
        />
      </div>
    </div>
  );
}
