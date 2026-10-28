import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { getCatalog, type CatalogParams } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeMatch } from "@/lib/match";
import { OpportunityCard } from "@/components/opportunity-card";
import { CatalogFilters } from "@/components/catalog-filters";
import { EmptyState } from "@/components/ui";
import { getT } from "@/lib/locale";
import styles from "./catalog.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: t.homeExtra.catalogMetaTitle,
    description: t.homeExtra.catalogMetaDescription,
  };
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<CatalogParams>;
}) {
  const params = await searchParams;
  const [{ items, total, page, totalPages }, user, { locale, t }] = await Promise.all([
    getCatalog(params),
    getCurrentUser(),
    getT(),
  ]);

  const savedIds = user
    ? new Set(
        (await prisma.savedOpportunity.findMany({ where: { userId: user.id }, select: { opportunityId: true } }))
          .map((s) => s.opportunityId),
      )
    : new Set<string>();

  const student = user?.studentProfile ?? null;

  return (
    <main className={styles.catalog}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <div className={styles.shell}>
        <header className={styles.intro}>
          <h1>{t.catalog.title}</h1>
          <p>{t.catalog.found}: <span>{total}</span></p>
        </header>

        <section className={styles.filterSection} aria-label={t.catalog.filtersAndSort}>
          <CatalogFilters locale={locale} horizontal />
        </section>

        <section className={styles.results} aria-label={t.catalog.title}>
          {items.length === 0 ? (
            <EmptyState
              icon={<SearchX className="h-8 w-8" />}
              title={t.catalog.empty}
              description={t.catalog.emptyHint}
            />
          ) : (
            <>
              <div className={styles.grid}>
                {items.map((opp) => (
                  <OpportunityCard
                    key={opp.id}
                    opp={opp}
                    match={user ? computeMatch(student, opp) : undefined}
                    saved={savedIds.has(opp.id)}
                    showSave={!!user}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <nav aria-label="Страницы каталога" className="mt-10 flex flex-wrap items-center justify-center gap-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                    const sp = new URLSearchParams(params as Record<string, string>);
                    sp.set("page", String(p));
                    return (
                      <Link
                        key={p}
                        href={`/catalog?${sp.toString()}`}
                        aria-current={p === page ? "page" : undefined}
                        aria-label={`Страница ${p}`}
                        className={`flex h-10 w-10 items-center justify-center rounded-lg border text-sm ${
                          p === page ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-surface-muted"
                        }`}
                      >
                        {p}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
