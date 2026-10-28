import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { ProfileEditor } from "@/components/profile-editor";
import type { OnboardingInput } from "@/app/actions/profile";
import styles from "../portal-pages.module.css";

export default async function ProfilePage() {
  const { t, locale } = await getT();
  const user = await requireUser();
  const p = user.studentProfile;

  const initial: OnboardingInput = {
    firstName: p?.firstName ?? "",
    lastName: p?.lastName ?? "",
    birthDate: p?.birthDate ? new Date(p.birthDate).toISOString().slice(0, 10) : "",
    city: p?.city ?? "",
    school: p?.school ?? "",
    grade: p?.grade ?? undefined,
    phone: p?.phone ?? "",
    interests: p?.interests ?? [],
    skills: p?.skills ?? [],
    goals: p?.goals ?? [],
    maxBudget: p?.maxBudget ?? undefined,
    willingToTravel: p?.willingToTravel ?? false,
    onlineOnly: p?.onlineOnly ?? false,
    hasPassport: p?.hasPassport ?? false,
    preferredLanguages: p?.preferredLanguages ?? [],
  };

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{t.profile.title}</h1>
          <p className={styles.subtitle}>{t.profile.subtitle}</p>
        </div>
      </div>
      <section className={`${styles.contentPanel} ${styles.storySection}`} aria-label={t.profile.title}>
        <ProfileEditor initial={initial} locale={locale} />
      </section>
    </div>
  );
}
