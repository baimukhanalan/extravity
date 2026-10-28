import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SubmitForm } from "@/components/submit-form";
import { Card, Badge } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/locale";
import styles from "../portal-pages.module.css";

const statusTone = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", DUPLICATE: "muted" } as const;

export default async function SubmitPage() {
  const { t, locale } = await getT();
  const statusLabel = {
    PENDING: t.submit.statusPending,
    APPROVED: t.submit.statusApproved,
    REJECTED: t.submit.statusRejected,
    DUPLICATE: t.submit.statusDuplicate,
  };
  const user = await requireUser();
  const submissions = await prisma.userSubmission.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{t.submit.title}</h1>
          <p className={styles.subtitle}>{t.submit.subtitle}</p>
        </div>
      </div>

      <div className={styles.submitLayout}>
        <SubmitForm locale={locale} />

        <section className={styles.storySection}>
          <h2 className={styles.sectionTitle}>{t.submit.yourSubmissions}</h2>
          <div className="mt-3 space-y-2">
            {submissions.length === 0 ? (
              <p className="text-sm text-muted">{t.submit.empty}</p>
            ) : (
              submissions.map((s) => (
                <Card key={s.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-sm text-primary hover:underline">
                      {s.url}
                    </a>
                    <Badge tone={statusTone[s.status]}>{statusLabel[s.status]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{formatDate(s.createdAt)}</p>
                </Card>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
