import { Sparkles, Target, CalendarClock, FileCheck2, Trophy, Search } from "lucide-react";
import { InfoHero, FeatureGrid } from "@/components/info-page";
import { getT } from "@/lib/locale";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.forStudentsPage.metaTitle };
}

export default async function ForStudentsPage() {
  const { t } = await getT();
  return (
    <>
      <InfoHero
        eyebrow={t.forStudentsPage.heroEyebrow}
        title={t.forStudentsPage.heroTitle}
        subtitle={t.forStudentsPage.heroSubtitle}
        cta={{ href: "/signup", label: t.forStudentsPage.ctaLabel }}
      />
      <FeatureGrid
        items={[
          { icon: Search, title: t.forStudentsPage.feature1Title, text: t.forStudentsPage.feature1Text },
          { icon: Target, title: t.forStudentsPage.feature2Title, text: t.forStudentsPage.feature2Text },
          { icon: Sparkles, title: t.forStudentsPage.feature3Title, text: t.forStudentsPage.feature3Text },
          { icon: CalendarClock, title: t.forStudentsPage.feature4Title, text: t.forStudentsPage.feature4Text },
          { icon: FileCheck2, title: t.forStudentsPage.feature5Title, text: t.forStudentsPage.feature5Text },
          { icon: Trophy, title: t.forStudentsPage.feature6Title, text: t.forStudentsPage.feature6Text },
        ]}
      />
    </>
  );
}
