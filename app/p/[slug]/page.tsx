import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy, MapPin, School, Sparkles, GraduationCap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isFlagEnabled } from "@/lib/flags";
import { Card, Badge } from "@/components/ui";
import { ACHIEVEMENT_TYPE_LABELS, INTERESTS, SKILLS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";

/**
 * Public read-only portfolio. Shown only when the flag is on AND the student
 * turned it on. Deliberately public-safe: name, school, interests, skills and
 * achievements — never email, phone, documents or applications. noindex so it
 * isn't crawled without the student's intent (set in generateMetadata).
 */

async function getProfile(slug: string) {
  if (!(await isFlagEnabled("portfolio_public_links"))) return null;
  const profile = await prisma.studentProfile.findUnique({
    where: { publicSlug: slug },
    select: {
      publicPortfolio: true,
      firstName: true,
      lastName: true,
      city: true,
      school: true,
      grade: true,
      interests: true,
      skills: true,
      userId: true,
    },
  });
  if (!profile || !profile.publicPortfolio) return null;
  return profile;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { t } = await getT();
  const profile = await getProfile(slug);
  if (!profile) return { title: t.publicPortfolio.metaTitle, robots: { index: false, follow: false } };
  return {
    title: interpolate(t.publicPortfolio.metaTitleNamed, {
      firstName: profile.firstName,
      lastName: profile.lastName,
    }),
    robots: { index: false, follow: false },
  };
}

export default async function PublicPortfolioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getT();
  const profile = await getProfile(slug);
  if (!profile) notFound();

  const achievements = await prisma.achievement.findMany({
    where: { userId: profile.userId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const interestLabels = (profile.interests ?? []).map((k) => INTERESTS.find((i) => i.key === k)?.label ?? k);
  const skillLabels = (profile.skills ?? []).map((k) => SKILLS.find((i) => i.key === k)?.label ?? k);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground">
          <GraduationCap className="h-5 w-5 text-primary" /> Extravity
        </Link>

        <Card className="p-6">
          <div className="flex items-start justify-between border-b border-border pb-5">
            <div>
              <h1 className="text-2xl font-semibold">{profile.firstName} {profile.lastName}</h1>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                {profile.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {profile.city}</span>}
                {profile.school && (
                  <span className="flex items-center gap-1">
                    <School className="h-3.5 w-3.5" /> {profile.school}{profile.grade ? interpolate(t.publicPortfolio.gradeSuffix, { grade: profile.grade }) : ""}
                  </span>
                )}
              </div>
            </div>
            <Trophy className="h-8 w-8 text-primary" />
          </div>

          {(interestLabels.length > 0 || skillLabels.length > 0) && (
            <div className="grid gap-5 border-b border-border py-5 sm:grid-cols-2">
              {interestLabels.length > 0 && (
                <div>
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> {t.publicPortfolio.interests}</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">{interestLabels.map((l) => <Badge key={l}>{l}</Badge>)}</div>
                </div>
              )}
              {skillLabels.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold">{t.publicPortfolio.skills}</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">{skillLabels.map((l) => <Badge key={l}>{l}</Badge>)}</div>
                </div>
              )}
            </div>
          )}

          <div className="pt-5">
            <h2 className="text-sm font-semibold">{t.publicPortfolio.achievements}</h2>
            {achievements.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{t.publicPortfolio.noAchievements}</p>
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

        <p className="mt-4 text-center text-xs text-muted">
          {t.publicPortfolio.builtOn}
        </p>
      </div>
    </div>
  );
}
