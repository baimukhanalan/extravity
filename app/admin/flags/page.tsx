import { ToggleRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, EmptyState } from "@/components/ui";
import { FlagToggle } from "@/components/flag-toggle";
import { getT } from "@/lib/locale";

export default async function AdminFlagsPage() {
  const { t } = await getT();
  const flags = await prisma.featureFlag.findMany({ orderBy: { key: "asc" } });

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.flags.title}</h1>
      <p className="mt-1 text-muted">{t.flags.subtitle}</p>

      <div className="mt-6">
        {flags.length === 0 ? (
          <EmptyState icon={<ToggleRight className="h-8 w-8" />} title={t.flags.emptyTitle} description={t.flags.emptyDescription} />
        ) : (
          <Card className="divide-y divide-border">
            {flags.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{f.description ?? f.key}</p>
                  <p className="font-mono text-xs text-muted">{f.key}</p>
                </div>
                <FlagToggle flagKey={f.key} enabled={f.enabled} />
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
