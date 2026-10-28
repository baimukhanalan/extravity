import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, FileText, UserRound, UsersRound } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, interpolate, type Locale } from "@/lib/i18n";

export type ApplicationReadinessItem = {
  key: string;
  state: "ready" | "pending" | "action";
  label: string;
  detail: string;
  href?: string;
};

const ICONS = {
  profile: UserRound,
  documents: FileText,
  guardian: UsersRound,
} as const;

export function ApplicationReadiness({ items, locale = DEFAULT_LOCALE }: { items: ApplicationReadinessItem[]; locale?: Locale }) {
  const d = getDictionary(locale).applications;
  const ready = items.filter((item) => item.state === "ready").length;

  return (
    <Card className="mb-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{d.readinessTitle}</h2>
          <p className="mt-1 text-sm text-muted">{d.readinessHint}</p>
        </div>
        <Badge tone={ready === items.length ? "success" : "warning"}>
          {interpolate(d.readinessCount, { ready, total: items.length })}
        </Badge>
      </div>
      <ul className="mt-4 space-y-3">
        {items.map((item) => {
          const Icon = ICONS[item.key as keyof typeof ICONS] ?? CircleDashed;
          const StateIcon = item.state === "ready" ? CheckCircle2 : item.state === "pending" ? CircleDashed : AlertTriangle;
          const content = (
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-0.5 text-xs text-muted">{item.detail}</p>
              </div>
              <StateIcon className={`mt-1 h-4 w-4 shrink-0 ${item.state === "ready" ? "text-success" : item.state === "pending" ? "text-warning" : "text-danger"}`} />
            </div>
          );
          return (
            <li key={item.key}>
              {item.href && item.state !== "ready" ? (
                <Link href={item.href} className="flex rounded-lg border border-border p-3 transition-colors hover:border-primary/40 hover:bg-primary/5">
                  {content}
                </Link>
              ) : <div className="flex rounded-lg border border-border p-3">{content}</div>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
