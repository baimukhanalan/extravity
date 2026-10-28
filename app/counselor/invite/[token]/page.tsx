import { notFound } from "next/navigation";
import { UserCog } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CounselorInviteResponse } from "@/components/counselor-invite-response";
import { Card, ButtonLink } from "@/components/ui";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import styles from "./invite.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.counsInvite.title };
}

export default async function CounselorInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await requireUser();
  const { t, locale } = await getT();

  const link = await prisma.counselorStudentLink.findUnique({
    where: { inviteToken: token },
    include: { counselor: true },
  });
  if (!link) notFound();

  const isRecipient =
    link.studentEmail === user.email.toLowerCase() || link.studentUserId === user.id;

  return (
    <main className={styles.page}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <div className={styles.inner}>
      <header className={styles.header}>
        <span className={styles.icon}><UserCog className="h-6 w-6" aria-hidden="true" /></span>
        <h1>{t.counsInvite.title}</h1>
        <p>{link.counselor.fullName}</p>
      </header>

      <Card className={styles.card}>
        <p className="text-sm">
          <span className="font-medium">{link.counselor.fullName}</span>
          {link.counselor.school ? ` (${link.counselor.school})` : ""} {t.counsInvite.invitesYou}
        </p>
        {link.note && <p className="mt-3 rounded-lg bg-surface-muted p-3 text-sm text-muted">{link.note}</p>}

        <p className="mt-4 text-xs text-muted">
          {t.counsInvite.accessNote}
        </p>

        <div className="mt-5">
          {!isRecipient ? (
            <p className="text-sm text-danger">
              {interpolate(t.counsInvite.wrongAccount, { email: link.studentEmail })}
            </p>
          ) : link.status === "pending" ? (
            <CounselorInviteResponse token={token} locale={locale} />
          ) : link.status === "active" ? (
            <div className="space-y-3">
              <p className="text-sm text-success">{t.counsInvite.alreadyAccepted}</p>
              <ButtonLink href="/app/settings" variant="outline">{t.counsInvite.manageAccess}</ButtonLink>
            </div>
          ) : (
            <p className="text-sm text-muted">{t.counsInvite.notActive}</p>
          )}
        </div>
      </Card>
      </div>
    </main>
  );
}
