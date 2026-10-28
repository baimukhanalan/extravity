import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Bookmark, FileText, CalendarClock, ArrowRight, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFeed } from "@/lib/recommendations";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import { OpportunityCard } from "@/components/opportunity-card";
import { Card, Badge, ButtonLink, ScoreRing } from "@/components/ui";
import { railwayMediaDisplayUrl } from "@/lib/railway-media-display";
import styles from "./portal-pages.module.css";

export default async function AppHome() {
  const user = await requireUser();
  if (["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(user.role)) redirect("/admin");
  if (!user.studentProfile?.onboardingCompleted) redirect("/app/onboarding");

  const student = user.studentProfile;

  const [savedRows, savedCount, activeApps, upcomingCount] = await Promise.all([
    prisma.savedOpportunity.findMany({ where: { userId: user.id }, select: { opportunityId: true } }),
    prisma.savedOpportunity.count({ where: { userId: user.id } }),
    prisma.application.count({
      where: { userId: user.id, status: { notIn: ["COMPLETED", "WITHDRAWN", "REJECTED"] } },
    }),
    prisma.application.count({
      where: { userId: user.id, opportunity: { applicationDeadline: { gte: new Date() } } },
    }),
  ]);

  const savedIds = new Set(savedRows.map((s) => s.opportunityId));
  const { locale, t } = await getT();
  const p = t.portal;
  const { sections, topPick } = await getFeed(student, locale);
  const topMedia = topPick?.opp.media?.[0];
  const topMediaUrl = topMedia ? railwayMediaDisplayUrl(topMedia) ?? topMedia.url : null;

  return (
    <div className={styles.page}>
      {/* Greeting */}
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{interpolate(p.greeting, { name: student.firstName })}</h1>
          <p className={styles.subtitle}>{p.greetingSub}</p>
        </div>
        <ButtonLink href="/app/discover" variant="outline">
          {p.allFeed} <ArrowRight className="h-4 w-4" />
        </ButtonLink>
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        <StatCard href="/app/saved" icon={<Bookmark className="h-5 w-5" />} value={savedCount} label={p.statSaved} />
        <StatCard href="/app/applications" icon={<FileText className="h-5 w-5" />} value={activeApps} label={p.statActiveApps} />
        <StatCard href="/app/calendar" icon={<CalendarClock className="h-5 w-5" />} value={upcomingCount} label={p.statDeadlines} />
      </div>

      {/* Top pick */}
      {topPick && (
        <Card className={`${styles.spotlight} ${styles.storySection}`}>
          <div className={styles.spotlightBody}>
            <div className="flex items-start gap-4">
              <ScoreRing score={topPick.match.score} size={64} label="%" />
              <div>
                <Badge tone="primary" className="mb-1"><Sparkles className="h-3.5 w-3.5" /> {p.bestMatch}</Badge>
                <h2 className={styles.spotlightTitle}>{topPick.opp.title}</h2>
                <p className={styles.spotlightText}>{topPick.opp.shortDescription}</p>
                {topPick.match.reasons[0] && (
                  <p className="mt-1 text-xs text-success">{topPick.match.reasons[0]}</p>
                )}
              </div>
            </div>
            <ButtonLink href={`/opportunities/${topPick.opp.slug}`} className="shrink-0">{p.open}</ButtonLink>
          </div>
          {topMedia && topMediaUrl ? (
            <div className={styles.spotlightMedia}>
              {topMedia.kind === "IMAGE" ? (
                <Image src={topMediaUrl} unoptimized={Boolean(railwayMediaDisplayUrl(topMedia))} alt={topMedia.altText ?? topPick.opp.title} fill sizes="(max-width: 640px) 100vw, 40vw" className="object-cover" />
              ) : (
                <video src={topMediaUrl} muted playsInline preload="metadata" aria-label={topMedia.altText ?? topPick.opp.title} />
              )}
            </div>
          ) : null}
        </Card>
      )}

      {/* Feed sections */}
      {sections.map((section) => (
        <section key={section.key} className={styles.storySection}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>{section.title}</h2>
              {section.subtitle && <p className={styles.sectionSubtitle}>{section.subtitle}</p>}
            </div>
          </div>
          <div className={styles.feedRail}>
            {section.items.map((s) => (
              <div key={s.opp.id} className={styles.feedItem}>
                <OpportunityCard opp={s.opp} match={s.match} saved={savedIds.has(s.opp.id)} showSave />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function StatCard({
  href,
  icon,
  value,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <Link href={href} className={styles.statLink}>
      <Card className={styles.statCard}>
        <div className="flex items-center gap-3">
          <span className={styles.statIcon}>{icon}</span>
          <div>
            <p className={styles.statValue}>{value}</p>
            <p className={styles.statLabel}>{label}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
