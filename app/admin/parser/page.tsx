import { Camera, Cpu, MessageCircle, Send } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, Badge, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import { fetchParserHealth, parserIntegrationCards } from "@/lib/parser-health";

const statusTone = { completed: "success", running: "primary", queued: "warning", failed: "danger", partial_failure: "danger" } as const;

export default async function ParserJobsPage() {
  const { t } = await getT();
  const [jobs, rawStats, parserHealth] = await Promise.all([
    prisma.parserJob.findMany({
      include: { connector: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.rawSourceItem.groupBy({ by: ["processingState"], _count: true }),
    fetchParserHealth(),
  ]);

  const totals = rawStats.reduce<Record<string, number>>((acc, r) => {
    acc[r.processingState] = r._count;
    return acc;
  }, {});

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.parser.title}</h1>
      <p className="mt-1 text-muted">{t.parser.subtitle}</p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {parserHealth.ok ? parserIntegrationCards(parserHealth.health).map((integration) => {
          const Icon = integration.key === "telegram" ? Send : integration.key === "whatsapp" ? MessageCircle : Camera;
          return (
            <Card key={integration.key} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4 text-primary" />{integration.title}</div>
                <Badge tone={integration.ready && integration.scheduled ? "success" : integration.ready ? "warning" : "danger"}>
                  {integration.ready && integration.scheduled ? "Работает" : integration.ready ? "Готов, не запущен" : "Нужна настройка"}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted">{integration.detail}</p>
              {integration.sourceCount !== null ? <p className="mt-2 text-xs text-muted">Разрешённых источников: {integration.sourceCount}</p> : null}
            </Card>
          );
        }) : (
          <Card className="border-danger/30 bg-danger/5 p-4 md:col-span-3">
            <p className="font-medium text-danger">Живой статус parser недоступен</p>
            <p className="mt-1 text-sm text-muted">{parserHealth.reason}</p>
          </Card>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: t.parser.statIngested, key: "ingested", tone: "success" },
          { label: t.parser.statDuplicate, key: "duplicate", tone: "muted" },
          { label: t.parser.statFailed, key: "failed", tone: "danger" },
          { label: "Карантин", key: "quarantined", tone: "danger" },
          { label: "Истёкшие", key: "expired", tone: "muted" },
          { label: t.parser.statFetched, key: "fetched", tone: "neutral" },
        ].map((s) => (
          <Card key={s.key} className="p-4">
            <p className="text-xl font-semibold">{totals[s.key] ?? 0}</p>
            <p className="mt-1 text-xs text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        {jobs.length === 0 ? (
          <EmptyState
            icon={<Cpu className="h-8 w-8" />}
            title={t.parser.emptyTitle}
            description={t.parser.emptyDescription}
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t.parser.colConnector}</th>
                    <th className="px-4 py-3 font-medium">{t.parser.colStatus}</th>
                    <th className="px-4 py-3 font-medium">{t.parser.colFound}</th>
                    <th className="px-4 py-3 font-medium">{t.parser.colCreated}</th>
                    <th className="px-4 py-3 font-medium">{t.parser.colDuplicates}</th>
                    <th className="px-4 py-3 font-medium">{t.parser.colDuration}</th>
                    <th className="px-4 py-3 font-medium">{t.parser.colTime}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {jobs.map((j) => (
                    <tr key={j.id} className="hover:bg-surface-muted/50">
                      <td className="px-4 py-3">{j.connector?.name ?? "—"}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone[j.status as keyof typeof statusTone] ?? "neutral"}>{j.status}</Badge></td>
                      <td className="px-4 py-3 text-muted">{j.itemsFound}</td>
                      <td className="px-4 py-3 text-muted">{j.itemsCreated}</td>
                      <td className="px-4 py-3 text-muted">{j.itemsDuplicate}</td>
                      <td className="px-4 py-3 text-muted">{j.durationMs ? interpolate(t.parser.durationMs, { ms: j.durationMs }) : "—"}</td>
                      <td className="px-4 py-3 text-muted">{formatDate(j.createdAt)}</td>
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
