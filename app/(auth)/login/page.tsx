import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { getT } from "@/lib/locale";
import { safeReturnPath } from "@/lib/safe-return-path";
import styles from "../auth-pages.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.seo.loginTitle };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { locale, t } = await getT();
  const next = safeReturnPath((await searchParams).next);
  const demoAccessEnabled = process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true";
  return (
    <main className={styles.authPage}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <Link href="/" className={`${styles.brand} lg:hidden`}>
        <GraduationCap className="h-6 w-6 text-primary" />
        Extravity
      </Link>
      <header className={styles.heading}>
        <h1>{t.auth.loginTitle}</h1>
        <p>{t.auth.loginSubtitle}</p>
      </header>
      <AuthForm mode="login" locale={locale} next={next} />
      {demoAccessEnabled ? (
        <p className={styles.demo}>
          {t.authPage.demoAccessPrefix}{" "}
          <span className="font-medium text-foreground">student@demo.kz</span> /{" "}
          {t.authPage.demoPasswordLabel}{" "}
          <span className="font-medium text-foreground">password123</span>
        </p>
      ) : null}
    </main>
  );
}
