import Link from "next/link";
import { TriangleAlert, CheckCircle2, CircleDashed } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, Badge } from "@/components/ui";
import { CategoryIcon } from "@/components/category-icon";
import { formatDate, daysFromNow } from "@/lib/utils";
import { interpolate } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { activePublicOpportunityWhere } from "@/lib/public-opportunity";
import { summarizeModerationQueue } from "@/lib/moderation-queue-summary";
import { duplicateReviewFromProvenance } from "@/lib/ingest-duplicate";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.coverage.title };
}

// A category is "thin" below this many live opportunities, and "stale" if the
// newest one was added longer ago than this.
const THIN_THRESHOLD = 3;
const STALE_DAYS = 30;

export default async function CoveragePage() {
  const { t } = await getT();
  const now = new Date();
  const staleCutoff = daysFromNow(-STALE_DAYS);

  const [categories, active, pending] = await Promise.all([
    prisma.category.findMany({ orderBy: { order: "asc" } }),
    prisma.opportunity.findMany({
      where: activePublicOpportunityWhere(now),
      select: { categoryId: true, createdAt: true, eventStartDate: true, sourceType: true },
    }),
    prisma.opportunity.findMany({
      where: {
        deletedAt: null,
        OR: [
          { moderationStatus: { in: ["PENDING", "NEEDS_CHANGES"] } },
          { status: "SUSPICIOUS" },
        ],
      },
      select: {
        title: true,
        shortDescription: true,
        fullDescription: true,
        organizerName: true,
        sourceType: true,
        sourceUrl: true,
        applicationUrl: true,
        applicationDeadline: true,
        confidenceScore: true,
        provenance: { select: { adminOnlyJson: true } },
        media: { select: { processingState: true, rightsState: true, rightsEvidenceRef: true, url: true, storageKey: true, platformMediaId: true } },
      },
    }),
  ]);
  const queue = summarizeModerationQueue(pending.map((item) => {
    const duplicate = duplicateReviewFromProvenance(item.provenance?.adminOnlyJson);
    return { ...item, duplicateReviewRequired: Boolean(duplicate && !duplicate.resolvedAt) };
  }), now);

  const rows = categories.map((category) => {
    const items = active.filter((item) => item.categoryId === category.id);
    const live = items.length;
    const lastAddedAt = items.reduce<Date | null>((latest, item) =>
      !latest || item.createdAt > latest ? item.createdAt : latest, null);
    const stale = !lastAddedAt || lastAddedAt < staleCutoff;
    return {
      category,
      live,
      upcoming: items.filter((item) => item.eventStartDate && item.eventStartDate > now).length,
      lastAddedAt,
      sources: [...new Set(items.map((item) => item.sourceType).filter(Boolean))],
      thin: live < THIN_THRESHOLD,
      stale,
    };
  });

  const gaps = rows.filter((r) => r.thin).length;
  const staleCount = rows.filter((r) => r.stale && !r.thin).length;
  const totalLive = rows.reduce((sum, r) => sum + r.live, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.coverage.title}</h1>
      <p className="mt-1 text-muted">
        {interpolate(t.coverage.subtitle, { threshold: THIN_THRESHOLD, days: STALE_DAYS })}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xl font-semibold leading-none">{totalLive}</p>
          <p className="mt-1 text-xs text-muted">{t.coverage.statTotalLive}</p>
        </Card>
        <Card className={`p-4 ${gaps > 0 ? "border-danger/40" : ""}`}>
          <p className="text-xl font-semibold leading-none">{gaps}</p>
          <p className="mt-1 text-xs text-muted">{t.coverage.statGaps}</p>
        </Card>
        <Card className={`p-4 ${staleCount > 0 ? "border-warning/40" : ""}`}>
          <p className="text-xl font-semibold leading-none">{staleCount}</p>
          <p className="mt-1 text-xs text-muted">{t.coverage.statStale}</p>
        </Card>
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">{t.coverage.queueTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.coverage.queueDescription}</p>
          </div>
          <Link href="/admin/moderation" className="text-sm font-medium text-primary hover:underline">
            {t.coverage.reviewQueue}
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            [queue.total, t.coverage.queuePending],
            [queue.withMedia, t.coverage.queueWithMedia],
            [queue.onlyMediaRightsPending, t.coverage.queueRightsOnly],
            [queue.otherwiseReady, t.coverage.queueOtherwiseReady],
          ] as const).map(([count, label]) => (
            <Card key={label} className="p-4">
              <p className="text-xl font-semibold leading-none">{count}</p>
              <p className="mt-1 text-xs text-muted">{label}</p>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          {interpolate(t.coverage.queueBlockers, {
            application: queue.missingApplicationUrl,
            deadline: queue.missingDeadline,
            expired: queue.expiredDeadline,
            media: queue.missingApprovedMedia,
          })}
        </p>
      </section>

      <Card className="mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t.coverage.thCategory}</th>
                <th className="px-4 py-3 font-medium">{t.coverage.thLive}</th>
                <th className="px-4 py-3 font-medium">{t.coverage.thUpcoming}</th>
                <th className="px-4 py-3 font-medium">{t.coverage.thLastAdded}</th>
                <th className="px-4 py-3 font-medium">{t.coverage.thSources}</th>
                <th className="px-4 py-3 font-medium">{t.coverage.thStatus}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows
                // Worst first: gaps on top, then stale, then healthy.
                .sort((a, b) => Number(b.thin) - Number(a.thin) || Number(b.stale) - Number(a.stale) || a.live - b.live)
                .map(({ category, live, upcoming, lastAddedAt, sources, thin, stale }) => (
                  <tr key={category.id} className="hover:bg-surface-muted/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/catalog?category=${category.slug}`}
                        className="inline-flex items-center gap-2 font-medium hover:text-primary"
                      >
                        <CategoryIcon name={category.icon} className="h-4 w-4 text-muted" />
                        {category.nameRu}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={thin ? "font-semibold text-danger" : ""}>{live}</span>
                    </td>
                    <td className="px-4 py-3 text-muted">{upcoming}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(lastAddedAt)}</td>
                    <td className="px-4 py-3 text-muted">
                      {sources.length ? sources.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {thin ? (
                        <Badge tone="danger">
                          <TriangleAlert className="h-3.5 w-3.5" /> {t.coverage.statusGap}
                        </Badge>
                      ) : stale ? (
                        <Badge tone="warning">
                          <CircleDashed className="h-3.5 w-3.5" /> {t.coverage.statusStale}
                        </Badge>
                      ) : (
                        <Badge tone="success">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {t.coverage.statusHealthy}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-4 text-xs text-muted">
        {t.coverage.footnote}
      </p>
    </div>
  );
}
