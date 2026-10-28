import type { Metadata } from "next";
import { ShieldCheck, Lock, FileKey, Eye, UserCheck, Baby } from "lucide-react";
import { InfoHero, FeatureGrid, Prose } from "@/components/info-page";
import { getT } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.securityPage.metaTitle };
}

export default async function SecurityPage() {
  const { t } = await getT();

  return (
    <>
      <InfoHero
        eyebrow={t.securityPage.heroEyebrow}
        title={t.securityPage.heroTitle}
        subtitle={t.securityPage.heroSubtitle}
      />
      <FeatureGrid
        items={[
          { icon: Baby, title: t.securityPage.feat1Title, text: t.securityPage.feat1Text },
          { icon: Lock, title: t.securityPage.feat2Title, text: t.securityPage.feat2Text },
          { icon: FileKey, title: t.securityPage.feat3Title, text: t.securityPage.feat3Text },
          { icon: Eye, title: t.securityPage.feat4Title, text: t.securityPage.feat4Text },
          { icon: UserCheck, title: t.securityPage.feat5Title, text: t.securityPage.feat5Text },
          { icon: ShieldCheck, title: t.securityPage.feat6Title, text: t.securityPage.feat6Text },
        ]}
      />
      <Prose>
        <h2>{t.securityPage.rightsTitle}</h2>
        <ul>
          <li>{t.securityPage.rightsExport}</li>
          <li>{t.securityPage.rightsDelete}</li>
          <li>{t.securityPage.rightsRevoke}</li>
          <li>{t.securityPage.rightsShare}</li>
        </ul>
        <p className="text-sm text-muted">
          {t.securityPage.demoNote}
        </p>
      </Prose>
    </>
  );
}
