import { Bookmark } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeMatch } from "@/lib/match";
import { OpportunityCard } from "@/components/opportunity-card";
import { SavedSearches } from "@/components/saved-searches";
import { EmptyState, ButtonLink } from "@/components/ui";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import { savedPublicOpportunityWhere } from "@/lib/public-opportunity";
import { publicSourceMediaWhere } from "@/lib/source-media-provenance";
import { retainExactTelegramMedia } from "@/lib/exact-telegram-media";
import styles from "../portal-pages.module.css";

export default async function SavedPage() {
  const { t, locale } = await getT();
  const user = await requireUser();
  const student = user.studentProfile ?? null;

  const [savedRows, searches] = await Promise.all([
    prisma.savedOpportunity.findMany({
      where: savedPublicOpportunityWhere(user.id),
      include: { opportunity: { include: { category: true, media: { where: publicSourceMediaWhere, orderBy: { position: "asc" } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.savedSearch.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const saved = savedRows.flatMap((row) => {
    const opportunity = retainExactTelegramMedia(row.opportunity);
    return opportunity ? [{ ...row, opportunity }] : [];
  });

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{t.saved.title}</h1>
          <p className={styles.subtitle}>{interpolate(t.saved.countInList, { count: saved.length })}</p>
        </div>
      </div>

      <section className={`${styles.savedSection} ${styles.storySection}`}>
        <h2 className={styles.sectionTitle}>{t.saved.savedSearchesHeading}</h2>
        <SavedSearches
          items={searches.map((s) => ({
            id: s.id,
            name: s.name,
            filters: (s.filters ?? {}) as Record<string, string>,
            alertsEnabled: s.alertsEnabled,
          }))}
          locale={locale}
        />
      </section>

      <section className={`${styles.savedSection} ${styles.storySection}`}>
        <h2 className={styles.sectionTitle}>{t.saved.opportunitiesHeading}</h2>
        {saved.length === 0 ? (
          <EmptyState
            icon={<Bookmark className="h-8 w-8" />}
            title={t.saved.emptyTitle}
            description={t.saved.emptyDescription}
            action={<ButtonLink href="/app/discover">{t.cabinet.openFeed}</ButtonLink>}
          />
        ) : (
          <div className={styles.cardGrid}>
            {saved.map((s) => (
              <OpportunityCard
                key={s.id}
                opp={s.opportunity}
                match={computeMatch(student, s.opportunity)}
                saved
                showSave
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
