import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/locale";
import styles from "../help.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.faqPage.metaTitle };
}

export default async function FaqPage() {
  const { locale, t } = await getT();

  const currentAnswers = {
    ru: {
      cost: "Каталог и ручная подача на сайте организатора бесплатны.",
      apply: "Выберите возможность, проверьте условия и отправьте заявку вручную на официальном сайте организатора.",
      eyebrow: "Помощь и ясность",
      intro: "Короткие ответы о возможностях, стоимости и подаче заявок.",
      more: "Не нашли ответ?",
      contact: "Связаться с нами",
      pricing: "Посмотреть тарифы",
    },
    kk: {
      cost: "Каталог пен ұйымдастырушы сайтында өтінімді қолмен беру тегін.",
      apply: "Мүмкіндікті таңдап, шарттарын тексеріп, ресми ұйымдастырушы сайтында өтінімді өзіңіз беріңіз.",
      eyebrow: "Көмек және анықтық",
      intro: "Мүмкіндіктер, баға және өтінім беру туралы қысқа жауаптар.",
      more: "Жауап табылмады ма?",
      contact: "Байланысу",
      pricing: "Тарифтерді қарау",
    },
    en: {
      cost: "Browsing the catalog and applying manually on the organizer's website are free.",
      apply: "Choose an opportunity, verify its terms and submit manually on the organizer's official website.",
      eyebrow: "Help and clarity",
      intro: "Straight answers about opportunities, pricing, and applications.",
      more: "Still have a question?",
      contact: "Contact us",
      pricing: "View pricing",
    },
  }[locale];
  const FAQ = [
    { q: t.faqPage.faq1Q, a: t.faqPage.faq1A },
    { q: t.faqPage.faq2Q, a: currentAnswers.cost },
    { q: t.faqPage.faq3Q, a: t.faqPage.faq3A },
    { q: t.faqPage.faq4Q, a: currentAnswers.apply },
    { q: t.faqPage.faq5Q, a: t.faqPage.faq5A },
    { q: t.faqPage.faq6Q, a: t.faqPage.faq6A },
    { q: t.faqPage.faq7Q, a: t.faqPage.faq7A },
    { q: t.faqPage.faq8Q, a: t.faqPage.faq8A },
  ];

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <span className={styles.overline}>{currentAnswers.eyebrow}</span>
          <h1>{t.faqPage.title}</h1>
          <p>{currentAnswers.intro}</p>
        </header>
        <div className={styles.faqList}>
        {FAQ.map((f, i) => (
          <details key={i} className={styles.faqItem}>
            <summary>
              <span className={styles.index}>{String(i + 1).padStart(2, "0")}</span>
              <span className={styles.question}>{f.q}</span>
              <span className={styles.toggle} aria-hidden="true">+</span>
            </summary>
            <p className={styles.answer}>{f.a}</p>
          </details>
        ))}
        </div>
        <aside className={styles.nextStep}>
          <h2>{currentAnswers.more}</h2>
          <div><Link href="/contact">{currentAnswers.contact}</Link><Link href="/pricing">{currentAnswers.pricing}</Link></div>
        </aside>
      </div>
    </main>
  );
}
