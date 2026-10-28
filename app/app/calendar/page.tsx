import Link from "next/link";
import { CalendarClock, Download, CalendarX2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, Badge, EmptyState, ButtonLink } from "@/components/ui";
import { deadlineLabel, formatDate, daysUntil } from "@/lib/utils";
import { getT } from "@/lib/locale";
import styles from "../portal-pages.module.css";

type Ev = { id: string; title: string; slug: string; date: Date; kind: "deadline" | "event" };

export default async function CalendarPage() {
  const { t } = await getT();
  const user = await requireUser();

  const [saved, apps] = await Promise.all([
    prisma.savedOpportunity.findMany({ where: { userId: user.id }, include: { opportunity: true } }),
    prisma.application.findMany({ where: { userId: user.id }, include: { opportunity: true } }),
  ]);

  const map = new Map<string, Ev>();
  const push = (o: { id: string; title: string; slug: string; applicationDeadline: Date | null; eventStartDate: Date | null }) => {
    if (o.applicationDeadline) map.set(`d-${o.id}`, { id: o.id, title: o.title, slug: o.slug, date: o.applicationDeadline, kind: "deadline" });
    if (o.eventStartDate) map.set(`e-${o.id}`, { id: o.id, title: o.title, slug: o.slug, date: o.eventStartDate, kind: "event" });
  };
  saved.forEach((s) => push(s.opportunity));
  apps.forEach((a) => push(a.opportunity));

  const events = [...map.values()]
    .filter((e) => daysUntil(e.date)! >= -1)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Group by month
  const groups = new Map<string, Ev[]>();
  for (const e of events) {
    const key = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(e.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{t.calendar.title}</h1>
          <p className={styles.subtitle}>{t.calendar.subtitle}</p>
        </div>
        <a
          href="/api/calendar"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted"
        >
          <Download className="h-4 w-4" /> {t.calendar.exportIcs}
        </a>
      </div>

      <div className={styles.storySection}>
        {events.length === 0 ? (
          <EmptyState
            icon={<CalendarX2 className="h-8 w-8" />}
            title={t.calendar.emptyTitle}
            description={t.calendar.emptyDescription}
            action={<ButtonLink href="/app/discover">{t.cabinet.openFeed}</ButtonLink>}
          />
        ) : (
          <div className={styles.timeline}>
            {[...groups.entries()].map(([month, evs]) => (
              <section key={month} className={`${styles.timelineMonth} ${styles.storySection}`}>
                <h2 className={styles.timelineHeading}>{month}</h2>
                <Card className={`${styles.timelineCard} divide-y divide-border`}>
                  {evs.map((e) => {
                    const dl = deadlineLabel(e.date);
                    return (
                      <Link
                        key={`${e.kind}-${e.id}`}
                        href={`/opportunities/${e.slug}`}
                        className={styles.timelineRow}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`flex h-10 w-10 flex-col items-center justify-center rounded-lg text-xs font-semibold ${
                            e.kind === "deadline" ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary"
                          }`}>
                            <span className="text-sm leading-none">{e.date.getDate()}</span>
                          </span>
                          <div>
                            <p className="text-sm font-medium">{e.title}</p>
                            <p className="text-xs text-muted">
                              {e.kind === "deadline" ? t.calendar.deadlineSubmission : t.calendar.eventStart} · {formatDate(e.date)}
                            </p>
                          </div>
                        </div>
                        <Badge tone={dl.tone === "muted" ? "muted" : dl.tone === "danger" ? "danger" : dl.tone === "warning" ? "warning" : "neutral"}>
                          <CalendarClock className="h-3.5 w-3.5" /> {dl.text}
                        </Badge>
                      </Link>
                    );
                  })}
                </Card>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
