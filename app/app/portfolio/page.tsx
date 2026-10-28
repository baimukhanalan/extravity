import { Trophy, MapPin, School, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { Card, Badge, EmptyState, ButtonLink } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { PortfolioShare } from "@/components/portfolio-share";
import { isFlagEnabled } from "@/lib/flags";
import { ACHIEVEMENT_TYPE_LABELS, INTERESTS, SKILLS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import styles from "../portal-pages.module.css";

export default async function PortfolioPage() {
  const { t, locale } = await getT();
  const user = await requireUser();
  const p = user.studentProfile;
  const [achievements, publicLinksOn] = await Promise.all([
    prisma.achievement.findMany({
      where: { userId: user.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    isFlagEnabled("portfolio_public_links"),
  ]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const interestLabels = (p?.interests ?? []).map((k) => INTERESTS.find((i) => i.key === k)?.label ?? k);
  const skillLabels = (p?.skills ?? []).map((k) => SKILLS.find((i) => i.key === k)?.label ?? k);

  return (
    <div className={styles.page}>
      <div className={`${styles.intro} print:hidden`}>
        <div>
          <h1 className={styles.title}>{t.portfolio.title}</h1>
          <p className={styles.subtitle}>{t.portfolio.subtitle}</p>
        </div>
        <PrintButton locale={locale} />
      </div>

      {publicLinksOn && p && (
        <div className={styles.storySection}>
          <PortfolioShare
            initialEnabled={p.publicPortfolio}
            initialSlug={p.publicSlug}
            appUrl={appUrl}
            locale={locale}
          />
        </div>
      )}

      <Card className={`${styles.portfolioSheet} ${styles.storySection} print:border-0 print:shadow-none`}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-5">
          <div>
            <h2 className="text-2xl font-semibold">{p ? `${p.firstName} ${p.lastName}` : user.email}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {p?.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {p.city}</span>}
              {p?.school && <span className="flex items-center gap-1"><School className="h-3.5 w-3.5" /> {p.school}{p.grade ? `, ${interpolate(t.profile.gradeOption, { n: p.grade })}` : ""}</span>}
              <span>{user.email}</span>
            </div>
          </div>
          <Trophy className="h-8 w-8 text-primary print:hidden" />
        </div>

        {/* Interests & skills */}
        {(interestLabels.length > 0 || skillLabels.length > 0) && (
          <div className="grid gap-5 border-b border-border py-5 sm:grid-cols-2">
            {interestLabels.length > 0 && (
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> {t.profile.interests}</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {interestLabels.map((l) => <Badge key={l}>{l}</Badge>)}
                </div>
              </div>
            )}
            {skillLabels.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">{t.profile.skills}</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {skillLabels.map((l) => <Badge key={l}>{l}</Badge>)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Achievements timeline */}
        <div className="pt-5">
          <h3 className="text-sm font-semibold">{t.portfolio.achievementsSection}</h3>
          {achievements.length === 0 ? (
            <div className="mt-3 print:hidden">
              <EmptyState
                icon={<Trophy className="h-8 w-8" />}
                title={t.portfolio.emptyTitle}
                description={t.portfolio.emptyDescription}
                action={<ButtonLink href="/app/achievements">{t.achievements.add}</ButtonLink>}
              />
            </div>
          ) : (
            <ol className="mt-4 space-y-4 border-l border-border pl-5">
              {achievements.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{a.title}</p>
                    <Badge tone="primary">{ACHIEVEMENT_TYPE_LABELS[a.type] ?? a.type}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {[a.organization, a.role, a.result].filter(Boolean).join(" · ")}
                    {a.date ? ` · ${formatDate(a.date)}` : ""}
                  </p>
                  {a.description && <p className="mt-1 text-sm text-muted">{a.description}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}
