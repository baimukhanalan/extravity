import { redirect } from "next/navigation";
import { SearchX } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCatalog, type CatalogParams } from "@/lib/queries";
import { computeMatch } from "@/lib/match";
import { OpportunityCard } from "@/components/opportunity-card";
import { CatalogFilters } from "@/components/catalog-filters";
import { SaveSearchButton } from "@/components/save-search-button";
import { getT } from "@/lib/locale";
import { Card, EmptyState } from "@/components/ui";
import { pluralize } from "@/lib/utils";
import styles from "../portal-pages.module.css";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<CatalogParams>;
}) {
  const user = await requireUser();
  if (!user.studentProfile?.onboardingCompleted) redirect("/app/onboarding");
  const student = user.studentProfile;
  const params = await searchParams;

  const { t, locale } = await getT();
  const { items, total } = await getCatalog(params);
  const countWord =
    locale === "ru" ? pluralize(total, ["возможность", "возможности", "возможностей"]) : t.discover.opportunities;
  const savedRows = await prisma.savedOpportunity.findMany({
    where: { userId: user.id },
    select: { opportunityId: true },
  });
  const savedIds = new Set(savedRows.map((s) => s.opportunityId));

  // Client-side match sort when sort=match
  const scored = items
    .map((opp) => ({ opp, match: computeMatch(student, opp) }))
    .sort((a, b) => (params.sort && params.sort !== "match" ? 0 : b.match.score - a.match.score));

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{t.discover.title}</h1>
          <p className={styles.subtitle}>{total} {countWord} · {t.discover.matched}</p>
        </div>
      </div>

      <div className={styles.discoverLayout}>
        <aside className={styles.filterPanel}>
          <Card className={styles.filterCard}><CatalogFilters locale={locale} /></Card>
          <SaveSearchButton />
        </aside>
        <div className={styles.storySection}>
          {scored.length === 0 ? (
            <EmptyState icon={<SearchX className="h-8 w-8" />} title={t.catalog.empty} description={t.catalog.emptyHint} />
          ) : (
            <div className={styles.cardGrid}>
              {scored.map((s) => (
                <OpportunityCard key={s.opp.id} opp={s.opp} match={s.match} saved={savedIds.has(s.opp.id)} showSave />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
