import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/locale";
import { newsTopicLabel } from "@/lib/news";
import styles from "../../editorial.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const article = await prisma.newsArticle.findFirst({ where: { id, status: "PUBLISHED" }, select: { title: true, summary: true } });
  return article ? { title: `${article.title} — Extravity`, description: article.summary } : { title: "Новость не найдена — Extravity" };
}

export default async function NewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { locale }] = await Promise.all([params, getT()]);
  const article = await prisma.newsArticle.findFirst({ where: { id, status: "PUBLISHED" } });
  if (!article) notFound();
  const isEnglish = locale === "en";
  const isKazakh = locale === "kk";
  const external = isEnglish ? "Read the original article" : isKazakh ? "Түпнұсқаны оқу" : "Читать первоисточник";

  return <div className={styles.page}><article className={styles.articlePage}>
    <Link href="/news" className={styles.backLink}><ArrowLeft size={17} aria-hidden="true" />{isEnglish ? "All news" : isKazakh ? "Барлық жаңалықтар" : "Все новости"}</Link>
    <header className={`${styles.articleHeader} ${styles.reveal}`}>
      <div className={styles.articleMeta}><span className={styles.articleTopic}>{newsTopicLabel(article.topic, locale)}</span><time dateTime={article.publishedAt.toISOString()}>{new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(article.publishedAt)}</time></div>
      <h1>{article.title}</h1>
    </header>
    <section className={`${styles.articleBody} ${styles.reveal}`} aria-labelledby="summary-heading">
      <h2 id="summary-heading">{isEnglish ? "Brief summary" : isKazakh ? "Қысқаша мазмұны" : "Краткое содержание"}</h2>
      <p>{article.summary}</p>
    </section>
    <div className={`${styles.articleSource} ${styles.reveal}`}>
      <div><span>{isEnglish ? "Original source" : isKazakh ? "Бастапқы дереккөз" : "Первоисточник"}</span><strong>{article.sourceName}</strong></div>
      <a className={styles.sourceLink} href={article.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{external}<ArrowUpRight size={17} aria-hidden="true" /></a>
    </div>
  </article></div>;
}
