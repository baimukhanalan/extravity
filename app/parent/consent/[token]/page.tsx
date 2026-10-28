import { notFound } from "next/navigation";
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import type { ConsentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ParentConsentForm } from "@/components/parent-consent-form";
import { getT } from "@/lib/locale";
import styles from "./consent.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.parentConsent.pageTitle, robots: { index: false } };
}

export default async function ParentConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { t, locale } = await getT();
  const { token } = await params;
  const link = await prisma.parentStudentLink.findUnique({
    where: { inviteToken: token },
    include: { consents: true, student: { include: { studentProfile: true } } },
  });
  if (!link || link.status === "revoked") notFound();

  const studentName = link.student.studentProfile
    ? `${link.student.studentProfile.firstName} ${link.student.studentProfile.lastName}`
    : t.parentConsent.studentFallback;
  const types = link.consents.map((c) => c.type) as ConsentType[];
  const alreadyDone = link.status === "active";

  return (
    <div className={styles.page}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <GraduationCap className="h-6 w-6 text-primary" /> Extravity
          </Link>
        </div>
      </header>
      <main className={styles.content}>
        <div className={styles.formWrap}>
          <ParentConsentForm token={token} studentName={studentName} types={types} alreadyDone={alreadyDone} locale={locale} />
        </div>
        <p className={styles.note}>
          {t.parentConsent.demoNote}
        </p>
      </main>
    </div>
  );
}
