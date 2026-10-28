import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { getT } from "@/lib/locale";
import styles from "../editorial.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.pricingPage.title };
}

export default async function PricingPage() {
  const { locale } = await getT();
  const copy = locale === "en" ? {
    title: "Explore and apply for free.",
    intro: "The full catalog and manual applications on organizers' websites are available without a subscription.",
    label: "Available to everyone", plan: "Free catalog",
    description: "Find opportunities, review their terms, save favorites and apply directly on the organizer's website.",
    features: ["Full public catalog", "Search and filters", "Saved opportunities", "Manual applications"],
    action: "Browse the catalog", ending: "Every application stays under your control.",
    endingText: "Choose an opportunity, verify the terms and submit it directly to the organizer.", month: "month",
  } : locale === "kk" ? {
    title: "Қарау және өтінім беру тегін.",
    intro: "Толық каталог пен ұйымдастырушылар сайтындағы қолмен өтінім беру жазылымсыз қолжетімді.",
    label: "Барлығына қолжетімді", plan: "Тегін каталог",
    description: "Мүмкіндіктерді табыңыз, шарттарын тексеріңіз, таңдаулыларға сақтаңыз және ұйымдастырушы сайтында өтінім беріңіз.",
    features: ["Толық ашық каталог", "Іздеу және сүзгілер", "Таңдаулы мүмкіндіктер", "Қолмен өтінім беру"],
    action: "Каталогты қарау", ending: "Әр өтінім сіздің бақылауыңызда.",
    endingText: "Мүмкіндікті таңдаңыз, шарттарын тексеріңіз және өтінімді ұйымдастырушыға тікелей беріңіз.", month: "ай",
  } : {
    title: "Смотреть и подаваться — бесплатно.",
    intro: "Полный каталог и ручная подача на сайтах организаторов доступны без подписки.",
    label: "Доступно всем", plan: "Бесплатный каталог",
    description: "Находите возможности, проверяйте условия, сохраняйте избранное и подавайте заявку прямо на сайте организатора.",
    features: ["Весь открытый каталог", "Поиск и фильтры", "Избранные возможности", "Ручная подача заявок"],
    action: "Открыть каталог", ending: "Каждая заявка остаётся под вашим контролем.",
    endingText: "Выберите возможность, проверьте условия и отправьте заявку напрямую организатору.", month: "мес",
  };

  return <div className={styles.page}>
    <div className={styles.shell}>
      <header className={`${styles.hero} ${styles.pricingHero} ${styles.reveal}`}><h1>{copy.title}</h1><p>{copy.intro}</p></header>
      <div className={styles.planGrid}>
        <section className={`${styles.plan} ${styles.reveal}`} aria-labelledby="free-plan-title">
          <span className={styles.overline}>{copy.label}</span><h2 id="free-plan-title">{copy.plan}</h2>
          <p className={styles.planPrice}>0 ₸ <span>/ {copy.month}</span></p><p className={styles.planDescription}>{copy.description}</p>
          <ul>{copy.features.map((feature) => <li key={feature}><Check size={17} aria-hidden="true" />{feature}</li>)}</ul>
          <Link className={styles.primaryAction} href="/catalog">{copy.action}<ArrowUpRight size={17} aria-hidden="true" /></Link>
        </section>
      </div>
    </div>
    <section className={`${styles.darkBand} ${styles.reveal}`}><div className={styles.shell}><h2>{copy.ending}</h2><p>{copy.endingText}</p></div></section>
  </div>;
}

