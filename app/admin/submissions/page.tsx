import { prisma } from "@/lib/prisma";
import { Card, Badge, EmptyState } from "@/components/ui";
import { SubmissionReview } from "@/components/admin-controls";
import { formatDate } from "@/lib/utils";
import { Link2 } from "lucide-react";
import { getT } from "@/lib/locale";

const tone = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", DUPLICATE: "muted" } as const;

export default async function AdminSubmissionsPage() {
  const { t, locale } = await getT();
  const submissions = await prisma.userSubmission.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.submissions.title}</h1>
      <p className="mt-1 text-muted">{t.submissions.subtitle}</p>

      <div className="mt-6">
        {submissions.length === 0 ? (
          <EmptyState icon={<Link2 className="h-8 w-8" />} title={t.submissions.emptyTitle} description={t.submissions.emptyDescription} />
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-sm font-medium text-primary hover:underline">{s.url}</a>
                      <Badge tone={tone[s.status]}>{s.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{s.user.email} · {formatDate(s.createdAt)}</p>
                  </div>
                  {s.status === "PENDING" && <SubmissionReview id={s.id} locale={locale} />}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
