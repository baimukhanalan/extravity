import { requireParent } from "@/lib/auth";
import { ParentConsentManager } from "@/components/parent-consent-manager";
import { getT } from "@/lib/locale";
import styles from "../secondary.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.parentNav.consents };
}

export default async function ParentConsentsPage() {
  const { t, locale } = await getT();
  const { links } = await requireParent();

  const groups = links.map((l) => ({
    linkId: l.id,
    childName: l.student.studentProfile
      ? `${l.student.studentProfile.firstName} ${l.student.studentProfile.lastName}`.trim()
      : l.student.email,
    status: l.status,
    consents: l.consents.map((c) => ({ type: c.type, granted: c.granted })),
  }));

  return (
    <main className={styles.page}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <header className={styles.header}>
      <h1>{t.parentNav.consents}</h1>
      <p>
        {t.parentConsents.subtitle}
      </p>
      </header>

      <div className={`${styles.content} ${styles.consents}`}>
        <ParentConsentManager groups={groups} locale={locale} />
      </div>
    </main>
  );
}
