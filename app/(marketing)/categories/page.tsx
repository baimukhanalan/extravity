import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CATEGORIES } from "@/lib/constants";
import { CategoryIcon } from "@/components/category-icon";
import { getT } from "@/lib/locale";
import { activePublicOpportunityWhere } from "@/lib/public-opportunity";
import { publicSourceMediaWhere } from "@/lib/source-media-provenance";
import { retainOpportunitiesWithExactTelegramMedia } from "@/lib/exact-telegram-media";
import { ACTIVITY_DIRECTIONS, activityDirectionName, matchesActivityDirection } from "@/lib/activity-directions";
import styles from "../editorial.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.categoriesPage.title, description: t.categoriesPage.metaDescription };
}

export default async function CategoriesPage() {
  const [{ locale, t }, opportunities, cats] = await Promise.all([
    getT(),
    prisma.opportunity.findMany({
      where: activePublicOpportunityWhere(),
      select: {
        categoryId: true,
        title: true,
        shortDescription: true,
        fullDescription: true,
        tags: true,
        sourceUrl: true,
        media: { where: publicSourceMediaWhere },
      },
    }),
    prisma.category.findMany({ select: { id: true, slug: true } }),
  ]);
  const slugById = new Map(cats.map((cat) => [cat.id, cat.slug]));
  const countBySlug = new Map<string, number>();
  const currentOpportunities = retainOpportunitiesWithExactTelegramMedia(opportunities);
  for (const opportunity of currentOpportunities) {
    const slug = slugById.get(opportunity.categoryId);
    if (slug) countBySlug.set(slug, (countBySlug.get(slug) ?? 0) + 1);
  }
  const countByDirection = new Map(ACTIVITY_DIRECTIONS.map((direction) => [
    direction.slug,
    currentOpportunities.filter((opportunity) => matchesActivityDirection(opportunity, direction)).length,
  ]));
  const groupLabels = locale === "kk"
    ? { creative: "Шығармашылық және сахна", sport: "Спорт және қозғалыс" }
    : locale === "en"
      ? { creative: "Creative and stage", sport: "Sport and movement" }
      : { creative: "Творчество и сцена", sport: "Спорт и движение" };
  const directionIntro = locale === "kk"
    ? "Танымал бағыттармен шектелмейміз: тар шеңбердегі байқауларды, кастингтерді және спорттық жарыстарды да табамыз."
    : locale === "en"
      ? "Go beyond mainstream activities: discover specialist contests, castings and sports competitions too."
      : "Не ограничиваемся популярными направлениями: здесь также появляются нишевые конкурсы, кастинги и спортивные соревнования.";

  return <div className={styles.page}><div className={styles.shell}>
    <header className={`${styles.hero} ${styles.reveal}`}><h1>{t.categoriesPage.title}</h1><p>{t.categoriesPage.intro}</p></header>
    <nav className={styles.categoriesGrid} aria-label={t.categoriesPage.title}>
      {CATEGORIES.map((category, index) => <Link key={category.slug} href={`/catalog?category=${encodeURIComponent(category.slug)}`} className={`${styles.categoryLink} ${styles.reveal}`}>
        <span className={styles.categoryIndex}>{String(index + 1).padStart(2, "0")}</span>
        <CategoryIcon name={category.icon} className={`${styles.categoryIcon} h-6 w-6`} />
        <span className={styles.categoryName}>{locale === "kk" ? category.nameKz : locale === "en" ? category.name : category.nameRu}<span className={styles.categorySub}>{locale === "en" ? "Explore opportunities" : locale === "kk" ? "Мүмкіндіктерді қарау" : "Смотреть возможности"}</span></span>
        <span className={styles.categoryCount} aria-label={locale === "en" ? `${countBySlug.get(category.slug) ?? 0} current opportunities` : locale === "kk" ? `${countBySlug.get(category.slug) ?? 0} өзекті мүмкіндік` : `${countBySlug.get(category.slug) ?? 0} актуальных возможностей`}>{countBySlug.get(category.slug) ?? 0}</span>
      </Link>)}
    </nav>
    <section className={styles.directionSection} aria-labelledby="activity-directions-title">
      <header className={styles.directionHeader}>
        <h2 id="activity-directions-title">{locale === "kk" ? "Барлық қызығушылықтарға арналған мүмкіндіктер" : locale === "en" ? "Opportunities for every interest" : "Возможности для любых увлечений"}</h2>
        <p>{directionIntro}</p>
      </header>
      <div className={styles.directionGroups}>
        {(["creative", "sport"] as const).map((group) => (
          <section key={group} className={styles.directionGroup} aria-labelledby={`direction-${group}`}>
            <h3 id={`direction-${group}`}>{groupLabels[group]}</h3>
            <div className={styles.directionList}>
              {ACTIVITY_DIRECTIONS.filter((direction) => direction.group === group).map((direction) => (
                <Link key={direction.slug} href={`/catalog?q=${encodeURIComponent(direction.tag)}`} className={styles.directionLink}>
                  <CategoryIcon name={direction.icon} className={styles.directionIcon} />
                  <span>
                    <strong>{activityDirectionName(direction, locale)}</strong>
                    <small>{locale === "ru" ? direction.descriptionRu : locale === "kk" ? "Жаңа және өзекті мүмкіндіктер" : "Current and new opportunities"}</small>
                  </span>
                  <span className={styles.directionCount} aria-label={`${countByDirection.get(direction.slug) ?? 0}`}>{countByDirection.get(direction.slug) ?? 0}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  </div></div>;
}
