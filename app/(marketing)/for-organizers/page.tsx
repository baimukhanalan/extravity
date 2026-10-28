import { Megaphone, BadgeCheck, FileText, Users, BarChart3, Mail } from "lucide-react";
import { InfoHero, FeatureGrid } from "@/components/info-page";
import { getT } from "@/lib/locale";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.forOrganizersPage.metaTitle };
}

export default async function ForOrganizersPage() {
  const { t } = await getT();
  return (
    <>
      <InfoHero
        eyebrow={t.forOrganizersPage.heroEyebrow}
        title={t.forOrganizersPage.heroTitle}
        subtitle={t.forOrganizersPage.heroSubtitle}
        cta={{ href: "/organizer/register", label: t.forOrganizersPage.ctaLabel }}
      />
      <FeatureGrid
        items={[
          { icon: BadgeCheck, title: t.forOrganizersPage.feature1Title, text: t.forOrganizersPage.feature1Text },
          { icon: Megaphone, title: t.forOrganizersPage.feature2Title, text: t.forOrganizersPage.feature2Text },
          { icon: FileText, title: t.forOrganizersPage.feature3Title, text: t.forOrganizersPage.feature3Text },
          { icon: Users, title: t.forOrganizersPage.feature4Title, text: t.forOrganizersPage.feature4Text },
          { icon: BarChart3, title: t.forOrganizersPage.feature5Title, text: t.forOrganizersPage.feature5Text },
          { icon: Mail, title: t.forOrganizersPage.feature6Title, text: t.forOrganizersPage.feature6Text },
        ]}
      />
    </>
  );
}
