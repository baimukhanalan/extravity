import { ShieldCheck, Eye, CalendarClock, FileCheck2, CreditCard, BadgeCheck } from "lucide-react";
import { InfoHero, FeatureGrid } from "@/components/info-page";
import { getT } from "@/lib/locale";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.forParentsPage.metaTitle };
}

export default async function ForParentsPage() {
  const { t } = await getT();
  return (
    <>
      <InfoHero
        eyebrow={t.forParentsPage.heroEyebrow}
        title={t.forParentsPage.heroTitle}
        subtitle={t.forParentsPage.heroSubtitle}
        cta={{ href: "/signup", label: t.forParentsPage.ctaLabel }}
      />
      <FeatureGrid
        items={[
          { icon: Eye, title: t.forParentsPage.feature1Title, text: t.forParentsPage.feature1Text },
          { icon: ShieldCheck, title: t.forParentsPage.feature2Title, text: t.forParentsPage.feature2Text },
          { icon: BadgeCheck, title: t.forParentsPage.feature3Title, text: t.forParentsPage.feature3Text },
          { icon: CalendarClock, title: t.forParentsPage.feature4Title, text: t.forParentsPage.feature4Text },
          { icon: FileCheck2, title: t.forParentsPage.feature5Title, text: t.forParentsPage.feature5Text },
          { icon: CreditCard, title: t.forParentsPage.feature6Title, text: t.forParentsPage.feature6Text },
        ]}
      />
    </>
  );
}
