import { Radio, CheckCircle2, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, Badge, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/locale";

// Source connectors are created/updated by the parser service (apps/parser) when
// it ingests. Until it runs, this list is empty. The parser respects robots.txt,
// rate limits and source access rules.
export default async function AdminSourcesPage() {
  const { t } = await getT();
  const connectors = await prisma.sourceConnector.findMany({
    include: { _count: { select: { rawItems: true, jobs: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.sources.title}</h1>
      <p className="mt-1 text-muted">{t.sources.subtitle}</p>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted">
        <Radio className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>{t.sources.parserNotice}</span>
      </div>

      <div className="mt-6">
        {connectors.length === 0 ? (
          <EmptyState
            icon={<Radio className="h-8 w-8" />}
            title={t.sources.emptyTitle}
            description={t.sources.emptyDescription}
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t.sources.colSource}</th>
                    <th className="px-4 py-3 font-medium">{t.sources.colType}</th>
                    <th className="px-4 py-3 font-medium">{t.sources.colUrl}</th>
                    <th className="px-4 py-3 font-medium">{t.sources.colItems}</th>
                    <th className="px-4 py-3 font-medium">{t.sources.colLastRun}</th>
                    <th className="px-4 py-3 font-medium">{t.sources.colStatus}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {connectors.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-muted/50">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-muted">{c.type}</td>
                      <td className="px-4 py-3 max-w-[220px] truncate text-muted">{c.url}</td>
                      <td className="px-4 py-3 text-muted">{c._count.rawItems}</td>
                      <td className="px-4 py-3 text-muted">{c.lastRunAt ? formatDate(c.lastRunAt) : "—"}</td>
                      <td className="px-4 py-3">
                        <Badge tone={c.enabled ? "success" : "muted"}>
                          {c.enabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                          {c.enabled ? t.sources.statusActive : t.sources.statusPaused}
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
    </div>
  );
}
