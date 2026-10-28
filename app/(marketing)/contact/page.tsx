import { Mail, MessageCircle, Building2 } from "lucide-react";
import { getT } from "@/lib/locale";
import styles from "../help.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.contactPage.title };
}

export default async function ContactPage() {
  const { locale, t } = await getT();
  const copy = {
    ru: { eyebrow: "Обратная связь", intro: "Официальные каналы связи готовятся. Мы опубликуем их здесь после проверки; пока не отправляйте личные данные на адреса или аккаунты, найденные вне сайта.", status: "Канал готовится", note: "Адреса электронной почты и Telegram, ранее показанные здесь как примеры, не подтверждены как рабочие контакты Extravity." },
    kk: { eyebrow: "Кері байланыс", intro: "Ресми байланыс арналары дайындалып жатыр. Тексерілген соң оларды осында жариялаймыз; әзірге сайттан тыс табылған мекенжайларға не аккаунттарға жеке деректеріңізді жібермеңіз.", status: "Арна дайындалып жатыр", note: "Бұрын осы жерде мысал ретінде көрсетілген электрондық пошта мен Telegram Extravity-дің жұмыс істейтін байланыс арналары ретінде расталмаған." },
    en: { eyebrow: "Get in touch", intro: "Official contact channels are being prepared. We will publish them here once verified; for now, please do not send personal information to addresses or accounts found outside this site.", status: "Channel coming soon", note: "The email addresses and Telegram account previously shown here as examples have not been verified as working Extravity contact channels." },
  }[locale];
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <span className={styles.overline}>{copy.eyebrow}</span>
          <h1>{t.contactPage.title}</h1>
          <p>{copy.intro}</p>
        </header>
        <div className={styles.contactGrid}>
          <section className={styles.contactItem}><Mail aria-hidden="true" /><h2>{t.contactPage.emailLabel}</h2><p>{copy.status}</p></section>
          <section className={styles.contactItem}><MessageCircle aria-hidden="true" /><h2>{t.contactPage.telegramLabel}</h2><p>{copy.status}</p></section>
          <section className={styles.contactItem}><Building2 aria-hidden="true" /><h2>{t.contactPage.organizersLabel}</h2><p>{copy.status}</p></section>
        </div>
        <p className={styles.contactNote}>{copy.note}</p>
      </div>
    </main>
  );
}
