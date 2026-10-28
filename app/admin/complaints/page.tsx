import Link from "next/link";
import { Flag, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, Badge, EmptyState } from "@/components/ui";
import { ComplaintActions } from "@/components/admin-controls";
import { formatDate } from "@/lib/utils";
import { interpolate } from "@/lib/i18n";
import { getT } from "@/lib/locale";

const tone = { open: "warning", reviewing: "primary", resolved: "success", dismissed: "muted" } as const;

export default async function AdminComplaintsPage() {
  const { t, locale } = await getT();
  const complaints = await prisma.complaint.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Resolve opportunity titles for opportunity-type complaints.
  const oppIds = complaints.filter((c) => c.targetType === "opportunity").map((c) => c.targetId);
  const opps = oppIds.length
    ? await prisma.opportunity.findMany({ where: { id: { in: oppIds } }, select: { id: true, title: true, slug: true } })
    : [];
  const oppMap = new Map(opps.map((o) => [o.id, o]));

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.complaints.title}</h1>
      <p className="mt-1 text-muted">{interpolate(t.complaints.openOfTotal, { open: complaints.filter((c) => c.status === "open").length, total: complaints.length })}</p>

      <div className="mt-6">
        {complaints.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title={t.complaints.emptyTitle} description={t.complaints.emptyDescription} />
        ) : (
          <div className="space-y-3">
            {complaints.map((c) => {
              const opp = oppMap.get(c.targetId);
              return (
                <Card key={c.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Flag className="h-4 w-4 text-danger" />
                        <span className="font-medium">{c.reason}</span>
                        <Badge tone={tone[c.status as keyof typeof tone] ?? "neutral"}>{c.status}</Badge>
                      </div>
                      {opp ? (
                        <Link href={`/opportunities/${opp.slug}`} className="mt-1 block text-sm text-primary hover:underline">
                          {opp.title}
                        </Link>
                      ) : (
                        <p className="mt-1 text-sm text-muted">{c.targetType} · {c.targetId}</p>
                      )}
                      {c.details && <p className="mt-1 text-sm text-muted">{c.details}</p>}
                      <p className="mt-1 text-xs text-muted">{c.user?.email ?? t.complaints.anonymous} · {formatDate(c.createdAt)}</p>
                    </div>
                    {c.status === "open" && <ComplaintActions id={c.id} locale={locale} />}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
