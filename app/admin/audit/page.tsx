import { ScrollText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, Badge, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { interpolate } from "@/lib/i18n";
import { getT } from "@/lib/locale";

export default async function AuditPage() {
  const { t } = await getT();
  const logs = await prisma.auditLog.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.audit.title}</h1>
      <p className="mt-1 text-muted">{interpolate(t.audit.recentCount, { count: logs.length })}</p>

      {logs.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<ScrollText className="h-8 w-8" />} title={t.adminHome.auditEmpty} />
        </div>
      ) : (
        <Card className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">{t.audit.colAction}</th>
                  <th className="px-4 py-3 font-medium">{t.audit.colUser}</th>
                  <th className="px-4 py-3 font-medium">{t.audit.colEntity}</th>
                  <th className="px-4 py-3 font-medium">{t.audit.colTime}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-surface-muted/50">
                    <td className="px-4 py-3"><Badge tone="neutral">{l.action}</Badge></td>
                    <td className="px-4 py-3 text-muted">{l.user?.email ?? t.audit.system}</td>
                    <td className="px-4 py-3 text-muted">{l.entity ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(l.createdAt)}</td>
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
