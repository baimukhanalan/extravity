import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/locale";
import { NEWS_TOPICS, newsTopicLabel } from "@/lib/news";
import styles from "../editorial.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Новости — Extravity", description: "Короткие новости о технологиях, учёбе, карьере и возможностях для молодёжи." };
const PAGE_SIZE = 18;

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ topic?: string; page?: string }> }) {
  const [{ locale }, params] = await Promise.all([getT(), searchParams]);
  const topic = NEWS_TOPICS.includes(params.topic as (typeof NEWS_TOPICS)[number]) ? params.topic : undefined;
  const page = Math.max(1, Math.min(100, Number.parseInt(params.page || "1", 10) || 1));
  const where = { status: "PUBLISHED" as const, ...(topic ? { topic } : {}) };
  const [items, count] = await Promise.all([
    prisma.newsArticle.findMany({ where, orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.newsArticle.count({ where }),
  ]);
  const isEnglish = locale === "en";
  const isKazakh = locale === "kk";
  const heading = isEnglish ? "News for what’s next" : isKazakh ? "Болашаққа арналған жаңалықтар" : "Новости о том, что дальше";
  const intro = isEnglish ? "Technology, AI, education, career and money — concise takeaways with links to the original reporting." : isKazakh ? "Технология, ЖИ, оқу, мансап және қаржы: қысқа мазмұн мен бастапқы дереккөзге сілтеме." : "Технологии, ИИ, учёба, карьера и деньги — коротко о важном, со ссылкой на первоисточник.";
  const topicHref = (value?: string, pageNumber = 1) => `/news${value || pageNumber > 1 ? `?${new URLSearchParams({ ...(value ? { topic: value } : {}), ...(pageNumber > 1 ? { page: String(pageNumber) } : {}) })}` : ""}`;
  const date = (value: Date) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(value);
  const lead = items[0];
  const remaining = items.slice(1);

  return <div className={styles.page}><div className={styles.shell}>
    <header className={`${styles.hero} ${styles.newsHero} ${styles.reveal}`}><h1>{heading}</h1><p>{intro}</p></header>
    <nav className={styles.topics} aria-label={isEnglish ? "News topics" : isKazakh ? "Жаңалық тақырыптары" : "Темы новостей"}>
      {[undefined, ...NEWS_TOPICS].map((value) => <Link key={value || "all"} href={topicHref(value)} aria-current={topic === value ? "page" : undefined} className={`${styles.topic} ${topic === value ? styles.topicActive : ""}`}>
        {value ? newsTopicLabel(value, locale) : isEnglish ? "All" : isKazakh ? "Барлығы" : "Все"}
      </Link>)}
    </nav>

    {lead ? <div className={styles.articleList}>
      <article className={`${styles.leadArticle} ${styles.reveal}`}>
        <div>
          <div className={styles.articleMeta}><span className={styles.articleTopic}>{newsTopicLabel(lead.topic, locale)}</span><time dateTime={lead.publishedAt.toISOString()}>{date(lead.publishedAt)}</time></div>
          <h2><Link href={`/news/${lead.id}`}>{lead.title}</Link></h2>
          <p className={styles.articleSummary}>{lead.summary}</p>
          <Link className={styles.articleRead} href={`/news/${lead.id}`}>{isEnglish ? "Read the summary" : isKazakh ? "Мазмұнын оқу" : "Читать кратко"}<ArrowUpRight size={17} aria-hidden="true" /></Link>
        </div>
        <div className={styles.leadSide}>{isEnglish ? "From the original source" : isKazakh ? "Бастапқы дереккөз" : "По материалам первоисточника"}<strong>{lead.sourceName}</strong></div>
      </article>
      {remaining.map((article) => <Link key={article.id} href={`/news/${article.id}`} className={`${styles.articleRow} ${styles.reveal}`}>
        <span><time dateTime={article.publishedAt.toISOString()}>{date(article.publishedAt)}</time> · {newsTopicLabel(article.topic, locale)}</span>
        <h2>{article.title}</h2><ArrowRight size={18} aria-hidden="true" />
      </Link>)}
      <div className={styles.pagination}><span>{count} {isEnglish ? "articles" : isKazakh ? "мақала" : "материалов"}</span><div className="flex gap-2">
        {page > 1 && <Link href={topicHref(topic, page - 1)} aria-label={isEnglish ? "Previous page" : isKazakh ? "Алдыңғы бет" : "Предыдущая страница"}>←</Link>}
        {page * PAGE_SIZE < count && <Link href={topicHref(topic, page + 1)} aria-label={isEnglish ? "Next page" : isKazakh ? "Келесі бет" : "Следующая страница"}>→</Link>}
      </div></div>
    </div> : <div className={styles.empty}><h2>{isEnglish ? "No published news yet" : isKazakh ? "Әзірге жарияланған жаңалық жоқ" : "Пока нет опубликованных новостей"}</h2><p>{isEnglish ? "Verified updates will appear here after review." : isKazakh ? "Тексерілген жаңалықтар қаралғаннан кейін осында шығады." : "Проверенные материалы появятся здесь после редакционной проверки."}</p></div>}
  </div></div>;
}
