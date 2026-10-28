import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UserCog } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registerCounselor } from "@/app/actions/counselor";
import { CounselorProfileForm } from "@/components/counselor-profile-form";
import { getT } from "@/lib/locale";
import styles from "./register.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.counsRegister.metaTitle };
}

export default async function CounselorRegisterPage() {
  const user = await requireUser();
  const existing = await prisma.counselorProfile.findUnique({ where: { userId: user.id } });
  if (existing) redirect("/counselor");

  const { t, locale } = await getT();

  return (
    <main className={styles.entry}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <div className={styles.inner}>
      <Link href="/app" className={styles.back}>
        <ArrowLeft className="h-4 w-4" /> {t.counsRegister.toPortal}
      </Link>

      <header className={styles.header}>
        <span className={styles.icon}>
          <UserCog className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1>{t.counsNav.cabinetTitle}</h1>
        <p>{t.counsRegister.subtitle}</p>
      </header>

      <div className={styles.formWrap}>
        <CounselorProfileForm action={registerCounselor} submitLabel={t.counsRegister.createCabinet} locale={locale} />
      </div>
      </div>
    </main>
  );
}
