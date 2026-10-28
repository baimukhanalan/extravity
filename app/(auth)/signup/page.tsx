import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { getT } from "@/lib/locale";
import { safeReturnPath } from "@/lib/safe-return-path";
import styles from "../auth-pages.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.seo.signupTitle };
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { locale, t } = await getT();
  const next = safeReturnPath((await searchParams).next);
  return (
    <main className={styles.authPage}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <Link href="/" className={`${styles.brand} lg:hidden`}>
        <GraduationCap className="h-6 w-6 text-primary" />
        Extravity
      </Link>
      <header className={styles.heading}>
        <h1>{t.auth.signupTitle}</h1>
        <p>{t.auth.signupSubtitle}</p>
      </header>
      <AuthForm mode="signup" locale={locale} next={next} />
      <p className={styles.legal}>
        {t.authPage.termsAgreePrefix}{" "}
        <Link href="/terms" className="underline">{t.authPage.termsLink}</Link> {t.authPage.termsMiddle}{" "}
        <Link href="/privacy" className="underline">{t.authPage.privacyLink}</Link>.
      </p>
    </main>
  );
}
