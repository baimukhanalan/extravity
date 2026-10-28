import Link from "next/link";
import Image from "next/image";
import type { Prisma } from "@prisma/client";
import { AlertTriangle, CheckCircle2, ExternalLink, ShieldCheck, Inbox } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, Badge, EmptyState } from "@/components/ui";
import { MediaRightsReview, OpportunityModerationActions, PotentialDuplicateReview, SubmissionReview } from "@/components/admin-controls";
import { formatDate } from "@/lib/utils";
import { interpolate } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { assessOpportunityModeration, audienceStatusFromProvenance, ingestUnknownTermsFromProvenance } from "@/lib/opportunity-moderation";
import { railwayMediaDisplayUrl } from "@/lib/railway-media-display";
import { duplicateReviewFromProvenance } from "@/lib/ingest-duplicate";
import { isOpportunityPriceKnown } from "@/lib/opportunity-price";

const PAGE_SIZE = 50;

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { t, locale } = await getT();
  const requestedPage = Number((await searchParams).page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pendingWhere: Prisma.OpportunityWhereInput = {
    deletedAt: null,
    OR: [
      { moderationStatus: { in: ["PENDING", "NEEDS_CHANGES"] } },
      { status: "SUSPICIOUS" },
    ],
  };
  const [submissions, flagged, flaggedTotal] = await Promise.all([
    prisma.userSubmission.findMany({
      where: { status: "PENDING" },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.opportunity.findMany({
      where: pendingWhere,
      include: { category: true, provenance: { select: { adminOnlyJson: true } }, media: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.opportunity.count({ where: pendingWhere }),
  ]);
  const matchedIds = flagged.map((o) => duplicateReviewFromProvenance(o.provenance?.adminOnlyJson))
    .filter((review): review is NonNullable<typeof review> => Boolean(review && !review.resolvedAt))
    .map((review) => review.matchedOpportunityId);
  const matchedPublished = matchedIds.length > 0 ? await prisma.opportunity.findMany({
    where: { id: { in: matchedIds } }, select: { id: true, title: true, slug: true },
  }) : [];
  const matchedById = new Map(matchedPublished.map((item) => [item.id, item]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{t.moderation.title}</h1>
        <p className="mt-1 text-muted">{t.moderation.subtitle}</p>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Inbox className="h-5 w-5 text-warning" /> {interpolate(t.moderation.submittedLinks, { count: submissions.length })}</h2>
        {submissions.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title={t.moderation.queueEmptyTitle} description={t.moderation.queueEmptyDesc} />
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-sm font-medium text-primary hover:underline">{s.url}</a>
                    <p className="mt-0.5 text-xs text-muted">
                      {s.user.email} · {formatDate(s.createdAt)} {s.category ? `· ${s.category}` : ""}
                    </p>
                    {s.comment && <p className="mt-1 text-sm text-muted">{s.comment}</p>}
                  </div>
                  <SubmissionReview id={s.id} locale={locale} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">{interpolate(t.moderation.flaggedTitle, { count: flaggedTotal })}</h2>
        {flaggedTotal > PAGE_SIZE && (
          <nav aria-label="Страницы очереди модерации" className="mb-4 flex items-center gap-3 text-sm">
            {page > 1 && <Link href={`/admin/moderation?page=${page - 1}`} className="text-primary hover:underline">← Назад</Link>}
            <span>Страница {page} из {Math.ceil(flaggedTotal / PAGE_SIZE)}</span>
            {page * PAGE_SIZE < flaggedTotal && <Link href={`/admin/moderation?page=${page + 1}`} className="text-primary hover:underline">Далее →</Link>}
          </nav>
        )}
        {flagged.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title={t.moderation.noFlagsTitle} description={t.moderation.noFlagsDesc} />
        ) : (
          <div className="space-y-3">
            {flagged.map((o) => {
              const duplicateReview = duplicateReviewFromProvenance(o.provenance?.adminOnlyJson);
              const assessment = assessOpportunityModeration({
                ...o,
                allowUnknownPrice: !isOpportunityPriceKnown(o),
                ingestUnknownTerms: ingestUnknownTermsFromProvenance(o.provenance?.adminOnlyJson),
                audienceStatus: audienceStatusFromProvenance(o.provenance?.adminOnlyJson),
                duplicateReviewRequired: Boolean(duplicateReview && !duplicateReview.resolvedAt),
                moderationStatus: "APPROVED",
              });
              return (
              <Card key={o.id} className="flex flex-col gap-4 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                  {o.moderationStatus === "APPROVED"
                    ? <Link href={`/opportunities/${o.slug}`} className="font-medium hover:text-primary">{o.title}</Link>
                    : <p className="font-medium">{o.title}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone={o.status === "SUSPICIOUS" ? "danger" : "warning"}>{o.status}</Badge>
                    <span className="text-xs text-muted">Trust {o.trustScore}</span>
                    <span className="text-xs text-muted">{t.moderation.confidenceLabel}: {o.confidenceScore}%</span>
                  </div>
                  </div>
                  <OpportunityModerationActions id={o.id} publishAllowed={assessment.publishAllowed} priceKnown={isOpportunityPriceKnown(o)} locale={locale} />
                </div>

                <div className="space-y-2 rounded-xl border border-border bg-surface-muted/40 p-3 text-sm">
                  <p className="font-medium">{o.organizerName}</p>
                  <p>{o.shortDescription}</p>
                  {o.fullDescription && o.fullDescription !== o.shortDescription && <p className="whitespace-pre-wrap text-muted">{o.fullDescription}</p>}
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-border bg-surface-muted/40 p-3 text-sm">
                    <p className="font-medium">{t.moderation.sourceLabel}</p>
                    {o.sourceUrl ? (
                      <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-primary hover:underline">
                        {o.sourceUrl}<ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                    ) : <p className="mt-1 text-muted">—</p>}
                  </div>
                  <div className="rounded-xl border border-border bg-surface-muted/40 p-3 text-sm">
                    <p className="font-medium">{t.moderation.applicationLabel}</p>
                    {o.applicationUrl ? (
                      <a href={o.applicationUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-primary hover:underline">
                        {o.applicationUrl}<ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                    ) : <p className="mt-1 text-muted">—</p>}
                    <p className="mt-1 text-xs text-muted">{formatDate(o.applicationDeadline)}</p>
                  </div>
                </div>

                {duplicateReview && !duplicateReview.resolvedAt && matchedById.get(duplicateReview.matchedOpportunityId) && (
                  <PotentialDuplicateReview id={o.id}
                    matchedTitle={matchedById.get(duplicateReview.matchedOpportunityId)!.title}
                    matchedSlug={matchedById.get(duplicateReview.matchedOpportunityId)!.slug} locale={locale} />
                )}

                {assessment.publishAllowed ? (
                  <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> {t.moderation.readyTitle}
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {assessment.blockers.length > 0 && (
                      <div className="rounded-xl border border-danger/30 bg-danger/10 p-3">
                        <p className="flex items-center gap-2 text-sm font-medium text-danger"><AlertTriangle className="h-4 w-4" /> {t.moderation.blockersTitle}</p>
                        <ul className="mt-2 space-y-1 text-sm">
                          {assessment.blockers.map((reason) => <li key={reason}>• {t.moderation.reasonLabels[reason]}</li>)}
                        </ul>
                      </div>
                    )}
                    {assessment.risks.length > 0 && (
                      <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
                        <p className="flex items-center gap-2 text-sm font-medium text-warning"><AlertTriangle className="h-4 w-4" /> {t.moderation.risksTitle}</p>
                        <ul className="mt-2 space-y-1 text-sm">
                          {assessment.risks.map((reason) => <li key={reason}>• {t.moderation.reasonLabels[reason]}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {o.media.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {o.media.map((media) => {
                      const previewUrl = railwayMediaDisplayUrl(media, true);
                      return (
                      <div key={media.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                        <div className="relative aspect-video bg-muted/20">
                          {media.kind === "IMAGE" ? (
                            <Image src={previewUrl ?? media.url} unoptimized={Boolean(previewUrl)} alt={media.altText || o.title} fill className="object-cover" sizes="(max-width: 640px) 100vw, 33vw" />
                          ) : (
                            <video src={previewUrl ?? media.url} controls preload="metadata" className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="space-y-2 p-3">
                          <p className="text-xs text-muted">{media.kind} · {media.rightsState}</p>
                          <MediaRightsReview id={media.id} state={media.rightsState} />
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </Card>
              );
            })}
          </div>
        )}
        {flaggedTotal > PAGE_SIZE && page * PAGE_SIZE < flaggedTotal && (
          <Link href={`/admin/moderation?page=${page + 1}`} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Следующие 50 →</Link>
        )}
      </section>
    </div>
  );
}
