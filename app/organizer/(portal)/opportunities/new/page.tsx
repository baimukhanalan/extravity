import { requireOrganizer } from "@/lib/auth";
import { createOrganizerOpportunity } from "@/app/actions/organizer";
import { OrganizerOpportunityForm } from "@/components/organizer-opportunity-form";
import { getT } from "@/lib/locale";
import styles from "../../organizer-sections.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.orgOpps.newOpp };
}

export default async function NewOrganizerOpportunityPage() {
  await requireOrganizer();
  const { t, locale } = await getT();

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1>{t.orgOpps.newOpp}</h1>
          <p className="mt-1 text-muted">{t.orgOpps.newSubtitle}</p>
        </div>
      </header>
      <div className={styles.formSection}>
        <OrganizerOpportunityForm action={createOrganizerOpportunity} submitLabel={t.orgOpps.submitModeration} locale={locale} />
      </div>
    </div>
  );
}
