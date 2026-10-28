import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { registerOrganizer } from "@/app/actions/organizer";
import { OrganizerProfileForm } from "@/components/organizer-profile-form";
import { getT } from "@/lib/locale";
import styles from "./register.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.orgRegister.metaTitle };
}

export default async function OrganizerRegisterPage() {
  const user = await requireUser();
  if (user.organizer) redirect("/organizer");
  const { t, locale } = await getT();

  return (
    <main className={styles.entry}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <div className={styles.inner}>
      <Link href="/app" className={styles.back}>
        <ArrowLeft className="h-4 w-4" /> {t.orgRegister.toPortal}
      </Link>

      <header className={styles.header}>
        <span className={styles.icon}>
          <Building2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1>{t.orgNav.cabinetTitle}</h1>
        <p>{t.orgRegister.subtitle}</p>
      </header>

      <div className={styles.formWrap}>
        <OrganizerProfileForm action={registerOrganizer} submitLabel={t.orgRegister.submitCreate} locale={locale} />
      </div>
      </div>
    </main>
  );
}
