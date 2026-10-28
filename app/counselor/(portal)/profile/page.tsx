import { requireCounselor } from "@/lib/auth";
import { updateCounselorProfile } from "@/app/actions/counselor";
import { CounselorProfileForm } from "@/components/counselor-profile-form";
import { Card, Badge } from "@/components/ui";
import { getT } from "@/lib/locale";
import styles from "../secondary.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.counsProfile.metaTitle };
}

export default async function CounselorProfilePage() {
  const { profile } = await requireCounselor();
  const { t, locale } = await getT();

  return (
    <main className={styles.page}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <header className={styles.header}>
      <h1>{t.counsNav.profile}</h1>
      <p>{t.counsProfile.subtitle}</p>
      </header>

      <Card className={styles.status}>
        <div>
          <p className="font-medium">{t.counsProfile.verificationStatus}</p>
          <p className="text-xs text-muted">
            {t.counsProfile.verificationHint}
          </p>
        </div>
        <Badge tone={profile.verificationStatus === "VERIFIED" ? "success" : "warning"}>
          {profile.verificationStatus === "VERIFIED" ? t.counsProfile.verified : t.counsProfile.pending}
        </Badge>
      </Card>

      <div className={styles.formWrap}>
        <CounselorProfileForm
          action={updateCounselorProfile}
          submitLabel={t.counsProfile.save}
          locale={locale}
          defaults={{
            fullName: profile.fullName,
            school: profile.school,
            city: profile.city,
            position: profile.position,
          }}
        />
      </div>
    </main>
  );
}
