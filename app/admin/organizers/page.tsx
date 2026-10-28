import { Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, Badge, EmptyState } from "@/components/ui";
import { OrganizerReview } from "@/components/admin-controls";
import { formatDate } from "@/lib/utils";
import { ORGANIZER_TYPES } from "@/lib/constants";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.organizersAdmin.title };
}

const tone: Record<string, "success" | "warning" | "danger" | "muted"> = {
  VERIFIED: "success",
  PENDING: "warning",
  REJECTED: "danger",
  SUSPENDED: "danger",
  UNVERIFIED: "muted",
};

export default async function AdminOrganizersPage() {
  const { t, locale } = await getT();
  const organizers = await prisma.organizer.findMany({
    orderBy: [{ verificationStatus: "asc" }, { createdAt: "desc" }],
    include: { user: { select: { email: true } }, _count: { select: { opportunities: true } } },
    take: 200,
  });

  const pending = organizers.filter((o) => o.verificationStatus === "PENDING");
  const rest = organizers.filter((o) => o.verificationStatus !== "PENDING");

  function typeLabel(key: string | null) {
    return ORGANIZER_TYPES.find((t) => t.key === key)?.label ?? key ?? "—";
  }

  function row(o: (typeof organizers)[number]) {
    return (
      <div key={o.id} className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{o.name}</p>
            <p className="text-xs text-muted">
              {typeLabel(o.type)} · {o.city ?? "—"} · {t.organizersAdmin.bin} {o.bin ?? "—"} · {interpolate(t.organizersAdmin.opportunitiesCount, { count: o._count.opportunities })}
            </p>
            <p className="text-xs text-muted">
              {o.user?.email ?? t.organizersAdmin.noAccount}
              {o.website && (
                <>
                  {" · "}
                  <a href={o.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {o.website}
                  </a>
                </>
              )}
            </p>
            {o.description && <p className="mt-2 max-w-2xl text-sm text-muted">{o.description}</p>}
          </div>
          <div className="text-right">
            <Badge tone={tone[o.verificationStatus] ?? "muted"}>{o.verificationStatus}</Badge>
            <p className="mt-1 text-xs text-muted">
              {o.verificationRequestedAt ? formatDate(o.verificationRequestedAt) : formatDate(o.createdAt)}
            </p>
          </div>
        </div>
        {o.verificationNote && <p className="text-xs text-danger">{t.organizersAdmin.noteLabel} {o.verificationNote}</p>}
        <OrganizerReview id={o.id} locale={locale} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.organizersAdmin.title}</h1>
      <p className="mt-1 text-muted">{interpolate(t.organizersAdmin.pendingCount, { pending: pending.length, total: organizers.length })}</p>

      <h2 className="mt-6 font-semibold">{t.organizersAdmin.queueTitle}</h2>
      <div className="mt-3">
        {pending.length === 0 ? (
          <EmptyState icon={<Building2 className="h-8 w-8" />} title={t.organizersAdmin.queueEmpty} />
        ) : (
          <Card className="divide-y divide-border">{pending.map(row)}</Card>
        )}
      </div>

      {rest.length > 0 && (
        <>
          <h2 className="mt-8 font-semibold">{t.organizersAdmin.othersTitle}</h2>
          <Card className="mt-3 divide-y divide-border">{rest.map(row)}</Card>
        </>
      )}
    </div>
  );
}
