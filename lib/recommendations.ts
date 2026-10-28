import type { StudentProfile } from "@prisma/client";
import { prisma } from "./prisma";
import { computeMatch } from "./match";
import type { OppWithCategory } from "@/components/opportunity-card";
import { daysUntil } from "./utils";
import { isOpportunityPriceKnown } from "./opportunity-price";
import { DEFAULT_LOCALE, getDictionary, interpolate, type Locale } from "./i18n";
import { retainResolvedPublicOpportunities, standardActiveOpportunityWhere } from "./public-opportunity";
import { publicSourceMediaWhere } from "./source-media-provenance";
import { retainOpportunitiesWithExactTelegramMedia } from "./exact-telegram-media";

export type Scored = { opp: OppWithCategory; match: ReturnType<typeof computeMatch> };

export type FeedSection = {
  key: string;
  title: string;
  subtitle?: string;
  items: Scored[];
};

/** Build the personalized home feed from the active opportunity pool. */
export async function getFeed(student: StudentProfile | null, locale: Locale = DEFAULT_LOCALE): Promise<{
  sections: FeedSection[];
  topPick: Scored | null;
}> {
  const t = getDictionary(locale).portal;
  const poolRows = await prisma.opportunity.findMany({
    where: standardActiveOpportunityWhere(),
    include: {
      category: true,
      provenance: { select: { adminOnlyJson: true } },
      media: { where: publicSourceMediaWhere, orderBy: { position: "asc" } },
    },
    take: 120,
  });
  const pool = retainOpportunitiesWithExactTelegramMedia(retainResolvedPublicOpportunities(poolRows));

  const scored: Scored[] = pool.map((opp) => ({ opp, match: computeMatch(student, opp) }));

  const eligibleSorted = [...scored]
    .filter((s) => s.match.eligible)
    .sort((a, b) => b.match.score - a.match.score);

  const recommended = eligibleSorted.slice(0, 6);
  const topPick = recommended[0] ?? scored.sort((a, b) => b.match.score - a.match.score)[0] ?? null;

  const withDeadline = scored.filter((s) => {
    const d = daysUntil(s.opp.applicationDeadline);
    return d !== null && d >= 0 && d <= 21;
  });
  const deadlineSoon = [...withDeadline].sort(
    (a, b) => (daysUntil(a.opp.applicationDeadline) ?? 999) - (daysUntil(b.opp.applicationDeadline) ?? 999),
  ).slice(0, 6);

  const fresh = [...scored]
    .sort((a, b) => b.opp.createdAt.getTime() - a.opp.createdAt.getTime())
    .slice(0, 6);

  const free = scored.filter((s) => s.opp.price === 0 && isOpportunityPriceKnown(s.opp)).sort((a, b) => b.match.score - a.match.score).slice(0, 6);

  const online = scored.filter((s) => s.opp.format === "ONLINE").sort((a, b) => b.match.score - a.match.score).slice(0, 6);

  const inCity = student?.city
    ? scored.filter((s) => s.opp.city === student.city).sort((a, b) => b.match.score - a.match.score).slice(0, 6)
    : [];

  const highValue = [...scored].sort((a, b) => b.opp.prestigeScore - a.opp.prestigeScore).slice(0, 6);

  const noDocs = scored
    .filter((s) => s.opp.requiredDocuments.length === 0 && s.match.eligible)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, 6);

  const sections: FeedSection[] = [
    { key: "recommended", title: t.feedRecommended, subtitle: t.feedRecommendedSub, items: recommended },
    { key: "deadline", title: t.feedDeadline, subtitle: t.feedDeadlineSub, items: deadlineSoon },
    { key: "new", title: t.feedNew, items: fresh },
    ...(inCity.length ? [{ key: "city", title: interpolate(t.feedCity, { city: student?.city ?? "" }), items: inCity }] : []),
    { key: "free", title: t.feedFree, items: free },
    { key: "online", title: t.feedOnline, items: online },
    { key: "value", title: t.feedValue, items: highValue },
    ...(noDocs.length ? [{ key: "nodocs", title: t.feedNoDocs, items: noDocs }] : []),
  ].filter((s) => s.items.length > 0);

  return { sections, topPick };
}
