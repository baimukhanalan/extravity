import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { safeReturnPath } from "@/lib/safe-return-path";
import styles from "../portal-pages.module.css";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { t, locale } = await getT();
  const user = await requireUser();
  const next = safeReturnPath((await searchParams).next);
  if (user.studentProfile?.onboardingCompleted) redirect(next ?? "/app");

  return (
    <div className={`${styles.page} py-4`}>
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{t.onboarding.title}</h1>
          <p className={styles.subtitle}>{t.onboarding.subtitle}</p>
        </div>
      </div>
      <div className={styles.storySection}>
        <OnboardingWizard
          firstName={user.studentProfile?.firstName ?? ""}
          lastName={user.studentProfile?.lastName ?? ""}
          locale={locale}
          next={next}
        />
      </div>
    </div>
  );
}
