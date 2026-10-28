import { Users, ClipboardList, BarChart3, FolderCheck, Send, ShieldCheck } from "lucide-react";
import { InfoHero, FeatureGrid } from "@/components/info-page";
import { getT } from "@/lib/locale";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.forSchoolsPage.metaTitle };
}

export default async function ForSchoolsPage() {
  const { t } = await getT();
  return (
    <>
      <InfoHero
        eyebrow={t.forSchoolsPage.heroEyebrow}
        title={t.forSchoolsPage.heroTitle}
        subtitle={t.forSchoolsPage.heroSubtitle}
        cta={{ href: "/counselor/register", label: t.forSchoolsPage.ctaLabel }}
      />
      <FeatureGrid
        items={[
          { icon: Users, title: t.forSchoolsPage.feature1Title, text: t.forSchoolsPage.feature1Text },
          { icon: ClipboardList, title: t.forSchoolsPage.feature2Title, text: t.forSchoolsPage.feature2Text },
          { icon: Send, title: t.forSchoolsPage.feature3Title, text: t.forSchoolsPage.feature3Text },
          { icon: FolderCheck, title: t.forSchoolsPage.feature4Title, text: t.forSchoolsPage.feature4Text },
          { icon: BarChart3, title: t.forSchoolsPage.feature5Title, text: t.forSchoolsPage.feature5Text },
          { icon: ShieldCheck, title: t.forSchoolsPage.feature6Title, text: t.forSchoolsPage.feature6Text },
        ]}
      />
    </>
  );
}
