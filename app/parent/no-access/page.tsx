import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ButtonLink } from "@/components/ui";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import styles from "./no-access.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.parentNav.cabinetTitle };
}

export default async function ParentNoAccessPage() {
  const { t } = await getT();
  const user = await requireUser();
  const linked = await prisma.parentStudentLink.count({
    where: { parentUserId: user.id, status: { in: ["pending", "active"] } },
  });
  if (linked > 0) redirect("/parent");

  return (
    <main className={styles.page}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <header className={styles.header}>
        <span className={styles.icon}><Users className="h-6 w-6" aria-hidden="true" /></span>
        <h1>{t.parentNav.cabinetTitle}</h1>
        <p>{t.parentNoAccess.subtitle}</p>
      </header>

      <section className={styles.instructions}>
        <p>
          {t.parentNoAccess.inviteInstructionsPrefix} <strong>{t.parentNoAccess.inviteInstructionsPath}</strong>. {t.parentNoAccess.inviteInstructionsSuffix}
        </p>
        <p className={styles.email}>
          {interpolate(t.parentNoAccess.boundToEmail, { email: user.email })}
        </p>
        <div className={styles.actions}>
          <ButtonLink href="/for-parents" variant="outline">{t.parentNoAccess.howItWorks}</ButtonLink>
          <ButtonLink href="/catalog">{t.parentNav.toCatalog}</ButtonLink>
        </div>
      </section>
    </main>
  );
}
