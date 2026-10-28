import { Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFeed } from "@/lib/recommendations";
import { OpportunityCard } from "@/components/opportunity-card";
import { Card, ScoreRing, Badge, EmptyState, ButtonLink } from "@/components/ui";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import styles from "../portal-pages.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.appNav.recommendations };
}

export default async function RecommendationsPage() {
  const { t } = await getT();
  const user = await requireUser();
  const student = user.studentProfile ?? null;

  const savedRows = await prisma.savedOpportunity.findMany({ where: { userId: user.id }, select: { opportunityId: true } });
  const savedIds = new Set(savedRows.map((s) => s.opportunityId));
  const { sections } = await getFeed(student);

  const recommended = sections.find((s) => s.key === "recommended")?.items ?? [];
  const valueItems = (sections.find((s) => s.key === "value")?.items ?? []).slice(0, 6);

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{t.recommendations.title}</h1>
          <p className={styles.subtitle}>{t.recommendations.subtitle}</p>
        </div>
      </div>

      <section className={styles.storySection} aria-label={t.recommendations.title}>
        {recommended.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title={t.recommendations.emptyTitle}
            description={t.recommendations.emptyDescription}
            action={<ButtonLink href="/app/profile">{t.recommendations.openProfile}</ButtonLink>}
          />
        ) : (
          <div className={styles.recommendationList}>
            {recommended.map((s) => (
              <Card key={s.opp.id} className={styles.recommendationCard}>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="flex items-start gap-3">
                    <ScoreRing score={s.match.score} size={56} label="%" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Badge tone="primary" className="mb-1">{s.opp.category.nameRu}</Badge>
                        <h3 className="font-semibold">{s.opp.title}</h3>
                      </div>
                      <ButtonLink href={`/opportunities/${s.opp.slug}`} size="sm" variant="outline">{t.recommendations.open}</ButtonLink>
                    </div>
                    {s.match.reasons.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm text-success">
                        {s.match.reasons.slice(0, 3).map((r, i) => <li key={i}>✓ {r}</li>)}
                      </ul>
                    )}
                    {s.match.gaps.length > 0 && (
                      <p className="mt-1 text-xs text-muted">{interpolate(t.recommendations.willNeed, { gaps: s.match.gaps.join(", "), hours: s.match.estimatedHours })}</p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {valueItems.length > 0 && (
        <section className={styles.storySection}>
          <h2 className={`${styles.sectionTitle} mb-3`}>{t.recommendations.moreForYou}</h2>
          <div className={styles.cardGrid}>
            {valueItems.map((s) => (
              <OpportunityCard key={s.opp.id} opp={s.opp} match={s.match} saved={savedIds.has(s.opp.id)} showSave />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
