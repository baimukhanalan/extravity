import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  MapPin, CalendarClock, Users2, Globe, BadgeCheck, ShieldQuestion, ShieldCheck,
  Trophy, FileText, ClipboardList, ArrowLeft, CheckCircle2, XCircle, Clock,
  ArrowUpRight,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { computeMatch } from "@/lib/match";
import { startApplication } from "@/app/actions/applications";
import { OpportunityCard } from "@/components/opportunity-card";
import { CategoryIcon } from "@/components/category-icon";
import { SaveButton } from "@/components/save-button";
import { ReportButton } from "@/components/report-button";
import { ReviewForm } from "@/components/review-form";
import { ViewTracker } from "@/components/view-tracker";
import { OpportunityMediaGallery } from "@/components/opportunity-media-gallery";
import { Badge, ButtonLink, Card, ScoreRing, Separator, Button } from "@/components/ui";
import { REQUIRED_DOCUMENTS, REVIEW_OUTCOME_LABELS } from "@/lib/constants";
import { formatDate, formatOpportunityPrice, deadlineLabel, categoryName } from "@/lib/utils";
import { isOpportunityPriceKnown } from "@/lib/opportunity-price";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import { getOpportunityAvailability } from "@/lib/opportunity-availability";
import { hasPublicCatalogApproval, isParsedPublicListing, publicOpportunityWhere, retainPublicCatalogOpportunities } from "@/lib/public-opportunity";
import { isOriginalTelegramPostMedia, publicSourceMediaWhere } from "@/lib/source-media-provenance";
import { opportunityMediaNotice } from "@/lib/opportunity-media-notice";
import { retainOpportunitiesWithExactTelegramMedia } from "@/lib/exact-telegram-media";
import styles from "./detail.module.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { t } = await getT();
  const opp = await prisma.opportunity.findFirst({
    where: { ...publicOpportunityWhere(), slug },
    include: { provenance: { select: { adminOnlyJson: true } }, media: { where: publicSourceMediaWhere } },
  });
  if (!opp || !hasPublicCatalogApproval(opp)
    || !opp.media.some((media) => isOriginalTelegramPostMedia(opp.sourceUrl, media))) return { title: t.oppDetail.notFoundTitle };
  return {
    title: opp.title,
    description: opp.shortDescription,
    openGraph: { title: opp.title, description: opp.shortDescription, type: "article" },
  };
}

function TrustBreakdown({ score, label }: { score: number; label: string }) {
  const tone = score >= 70 ? "success" : score >= 45 ? "warning" : "danger";
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <Badge tone={tone}>{score}/100</Badge>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${score}%`, background: `var(--${tone === "success" ? "success" : tone === "warning" ? "warning" : "danger"})` }}
        />
      </div>
    </div>
  );
}

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { t, locale } = await getT();
  const opp = await prisma.opportunity.findFirst({
    where: { ...publicOpportunityWhere(), slug },
    include: {
      category: true,
      provenance: { select: { adminOnlyJson: true } },
      media: { where: publicSourceMediaWhere, orderBy: { position: "asc" } },
    },
  });
  if (!opp || opp.deletedAt || !hasPublicCatalogApproval(opp)) notFound();
  opp.media = opp.media.filter((media) => isOriginalTelegramPostMedia(opp.sourceUrl, media));
  if (opp.media.length === 0) notFound();

  const user = await getCurrentUser();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const student = user?.studentProfile ?? null;
  const match = user ? computeMatch(student, opp) : null;

  const [saved, application, similar] = await Promise.all([
    user
      ? prisma.savedOpportunity.findUnique({
          where: { userId_opportunityId: { userId: user.id, opportunityId: opp.id } },
        })
      : null,
    user
      ? prisma.application.findUnique({
          where: { userId_opportunityId: { userId: user.id, opportunityId: opp.id } },
        })
      : null,
    prisma.opportunity.findMany({
      where: { ...publicOpportunityWhere(), categoryId: opp.categoryId, id: { not: opp.id } },
      include: {
        category: true,
        provenance: { select: { adminOnlyJson: true } },
        media: { where: publicSourceMediaWhere, orderBy: { position: "asc" } },
      },
      take: 12,
    }),
  ]);
  const exactSimilar = retainOpportunitiesWithExactTelegramMedia(retainPublicCatalogOpportunities(similar)).slice(0, 3);

  // Social proof: public reviews + the current user's own review to prefill.
  const [reviews, myReview] = await Promise.all([
    prisma.opportunityReview.findMany({
      where: { opportunityId: opp.id, isPublic: true, comment: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, outcome: true, rating: true, comment: true, createdAt: true },
    }),
    user
      ? prisma.opportunityReview.findUnique({
          where: { userId_opportunityId: { userId: user.id, opportunityId: opp.id } },
          select: { outcome: true, rating: true, comment: true, isPublic: true },
        })
      : null,
  ]);

  const dl = deadlineLabel(opp.applicationDeadline);
  const availability = getOpportunityAvailability(opp);
  const unavailable = !availability.canApply;
  const parsedListing = isParsedPublicListing(opp);
  const suspicious = !parsedListing && (opp.status === "SUSPICIOUS" || opp.trustScore < 40);
  const priceKnown = isOpportunityPriceKnown(opp);
  const validExternalTarget = (value: string | null | undefined) => {
    if (!value) return false;
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  };
  const applicationTarget = (parsedListing
    ? [opp.sourceUrl, opp.applicationUrl]
    : [opp.applicationUrl, opp.sourceUrl]
  ).find(validExternalTarget) ?? null;
  const parsedApplicationFormTarget = parsedListing
    && validExternalTarget(opp.applicationUrl)
    && opp.applicationUrl !== applicationTarget
    ? opp.applicationUrl
    : null;
  const returnPath = `/opportunities/${opp.slug}`;
  const returnQuery = new URLSearchParams({ next: returnPath }).toString();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: opp.title,
    description: opp.shortDescription,
    startDate: opp.eventStartDate?.toISOString(),
    endDate: opp.eventEndDate?.toISOString(),
    eventAttendanceMode:
      opp.format === "ONLINE"
        ? "https://schema.org/OnlineEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode",
    location: opp.city ? { "@type": "Place", name: opp.venue ?? opp.city, address: opp.city } : undefined,
    organizer: { "@type": "Organization", name: opp.organizerName },
  };

  return (
    <main className={styles.detail}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Prata&display=swap" />
      <div className={styles.shell}>
      <script
        type="application/ld+json"
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <ViewTracker opportunityId={opp.id} />

      <Link href="/catalog" className={styles.backLink}>
        <ArrowLeft className="h-4 w-4" /> {t.oppDetail.backToCatalog}
      </Link>

      {suspicious && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t.oppDetail.suspiciousWarning}</span>
        </div>
      )}

      {unavailable ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-surface-muted px-4 py-3 text-sm text-muted">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{availability.expired ? t.oppDetail.expiredWarning : t.oppDetail.applicationClosed}</span>
        </div>
      ) : null}

      <div className={styles.layout}>
        {/* Main */}
        <div className={styles.story}>
          <div className="flex flex-wrap items-center gap-2" id="overview">
            <Badge tone="primary">
              <CategoryIcon name={opp.category.icon} className="h-3.5 w-3.5" />
              {categoryName(opp.category, locale)}
            </Badge>
            {opp.subcategory && <Badge>{opp.subcategory}</Badge>}
            {opp.isSponsored && <Badge tone="warning">{t.oppDetail.sponsored}</Badge>}
            {parsedListing && <Badge tone="warning">Условия уточняйте у организатора</Badge>}
          </div>

          <h1 className={styles.title}>{opp.title}</h1>

          <div className="mt-3 flex items-center gap-2 text-sm text-muted">
            <span className="font-medium text-foreground">{opp.organizerName}</span>
            {opp.organizerVerified === "VERIFIED" ? (
              <span className="flex items-center gap-1 text-success"><BadgeCheck className="h-4 w-4" /> {t.oppDetail.verified}</span>
            ) : (
              <span className="flex items-center gap-1"><ShieldQuestion className="h-4 w-4" /> {t.oppDetail.notVerified}</span>
            )}
          </div>

          <div className={styles.heroMedia}>
            <OpportunityMediaGallery media={opp.media} title={opp.title} notice={opportunityMediaNotice(opp.slug)} />
          </div>

          <p className={styles.description}>{opp.fullDescription}</p>

          {opp.requirements.length > 0 && (
            <section className={styles.contentSection} id="requirements">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><ClipboardList className="h-5 w-5 text-primary" /> {t.oppDetail.requirements}</h2>
              <ul className="mt-3 space-y-2">
                {opp.requirements.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {r}</li>
                ))}
              </ul>
            </section>
          )}

          {opp.requiredDocuments.length > 0 && (
            <section className={styles.contentSection} id="documents">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><FileText className="h-5 w-5 text-primary" /> {t.oppDetail.requiredDocuments}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {opp.requiredDocuments.map((d) => (
                  <Badge key={d}>{REQUIRED_DOCUMENTS[d] ?? d}</Badge>
                ))}
              </div>
            </section>
          )}

          {opp.selectionProcess && (
            <section className={styles.contentSection}>
              <h2 className="text-lg font-semibold">{t.oppDetail.selectionProcess}</h2>
              <p className="mt-2 text-sm text-muted">{opp.selectionProcess}</p>
            </section>
          )}

          {opp.prizes && (
            <section className={styles.contentSection}>
              <h2 className="flex items-center gap-2 text-lg font-semibold"><Trophy className="h-5 w-5 text-primary" /> {t.oppDetail.prizes}</h2>
              <p className="mt-2 text-sm text-muted">{opp.prizes}</p>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className={styles.sidebar}>
          {match && (
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <ScoreRing score={match.score} size={60} label="%" />
                <div>
                  <p className="font-semibold">{interpolate(t.oppDetail.matchScore, { score: match.score })}</p>
                  <p className="text-xs text-muted">
                    {match.eligible ? t.oppDetail.eligible : t.oppDetail.hasConstraints}
                  </p>
                </div>
              </div>
              {match.failures.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {match.failures.map((f, i) => (
                    <li key={i} className="flex gap-1.5 text-xs text-danger"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {f}</li>
                  ))}
                </ul>
              )}
              {match.reasons.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {match.reasons.map((r, i) => (
                    <li key={i} className="flex gap-1.5 text-xs text-muted"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> {r}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                <Clock className="h-3.5 w-3.5" /> {interpolate(t.oppDetail.hoursOnApplication, { hours: match.estimatedHours })}
              </div>
            </Card>
          )}

          <Card className={`${styles.actionCard} p-5`}>
            <dl className="space-y-3 text-sm">
              <Row icon={<CalendarClock className="h-4 w-4" />} label={t.oppDetail.deadline}>
                <span className={dl.tone === "danger" ? "text-danger font-medium" : dl.tone === "warning" ? "text-warning font-medium" : ""}>
                  {formatDate(opp.applicationDeadline)}
                </span>
              </Row>
              <Row icon={<CalendarClock className="h-4 w-4" />} label={t.oppDetail.start}>{formatDate(opp.eventStartDate)}</Row>
              <Row icon={<MapPin className="h-4 w-4" />} label={t.oppDetail.format}>
                {opp.format === "ONLINE" ? t.oppDetail.formatOnline : `${opp.city ?? "—"} · ${opp.format === "HYBRID" ? t.oppDetail.formatHybrid : t.oppDetail.formatOffline}`}
              </Row>
              <Row icon={<Users2 className="h-4 w-4" />} label={t.oppDetail.participation}>
                {opp.participationType === "TEAM"
                  ? interpolate(t.oppDetail.teamSize, { size: `${opp.minimumTeamSize ?? ""}${opp.maximumTeamSize ? `–${opp.maximumTeamSize}` : ""}` })
                  : opp.participationType === "BOTH" ? t.oppDetail.individualOrTeam : t.oppDetail.individual}
              </Row>
              {(opp.minimumAge !== null || opp.maximumAge !== null || opp.minimumGrade !== null || opp.maximumGrade !== null) && (
                <Row icon={<Globe className="h-4 w-4" />} label={t.oppDetail.ageGrade}>
                  {interpolate(t.oppDetail.ageGradeValue, {
                    minAge: opp.minimumAge ?? "—",
                    maxAge: opp.maximumAge ?? "—",
                    minGrade: opp.minimumGrade ?? "—",
                    maxGrade: opp.maximumGrade ?? "—",
                  })}
                </Row>
              )}
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted">{t.oppDetail.price}</span>
                <span className="font-semibold">{!priceKnown ? <span className="text-muted">{t.common.priceUnknown}</span> : opp.price === 0 ? <span className="text-success">{t.oppDetail.free}</span> : formatOpportunityPrice(opp.price, opp.currency, locale)}</span>
              </div>
              {(opp.scholarshipAvailable || opp.financialAidAvailable) && (
                <Badge tone="success">{t.oppDetail.financialAid}</Badge>
              )}
              <Separator />
              <TrustBreakdown score={opp.trustScore} label={t.oppDetail.trustScore} />
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <ShieldCheck className="h-3.5 w-3.5" /> {t.oppDetail.checkedLabel} {formatDate(opp.lastCheckedAt) || t.oppDetail.recently}
              </p>
            </dl>

            <div className="mt-4 space-y-2">
              {user ? (
                <>
                  {unavailable ? (
                    <Button type="button" size="lg" className="w-full" disabled>{t.oppDetail.applicationClosed}</Button>
                  ) : application ? (
                    <ButtonLink href={`/app/applications/${application.id}`} size="lg" className="w-full">
                      {t.oppDetail.openApplication}
                    </ButtonLink>
                  ) : (
                    <form action={startApplication.bind(null, opp.id)}>
                      <Button type="submit" size="lg" className="w-full">{t.oppDetail.startPreparation}</Button>
                    </form>
                  )}
                  <SaveButton opportunityId={opp.id} initialSaved={!!saved} variant="full" />
                </>
              ) : (
                <>
                  {unavailable ? (
                    <Button type="button" size="lg" className="w-full" disabled>{t.oppDetail.applicationClosed}</Button>
                  ) : (
                    <ButtonLink href={`/signup?${returnQuery}`} size="lg" className="w-full">{t.oppDetail.signupToApply}</ButtonLink>
                  )}
                  <ButtonLink href={`/login?${returnQuery}`} variant="outline" className="w-full">{t.oppDetail.login}</ButtonLink>
                </>
              )}
              {applicationTarget ? (
                <ButtonLink href={applicationTarget} target="_blank" rel="noopener noreferrer nofollow" variant="outline" className="w-full">
                  {parsedListing ? "Открыть объявление организатора" : "Подать у организатора"} <ArrowUpRight className="h-4 w-4" />
                </ButtonLink>
              ) : null}
              {parsedApplicationFormTarget ? (
                <ButtonLink href={parsedApplicationFormTarget} target="_blank" rel="noopener noreferrer nofollow" variant="ghost" className="w-full">
                  Открыть форму подачи <ArrowUpRight className="h-4 w-4" />
                </ButtonLink>
              ) : null}
              <ReportButton opportunityId={opp.id} />
            </div>
          </Card>
        </aside>
      </div>

      {/* Outcomes & reviews */}
      <section className={styles.lowerSection}>
        <h2 className="text-xl font-semibold">{t.oppDetail.participantResults}</h2>
        {(opp.appliedCount > 0 || opp.acceptedCount > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="neutral">{interpolate(t.oppDetail.appliedCount, { count: opp.appliedCount })}</Badge>
            {opp.acceptedCount > 0 && <Badge tone="success">{interpolate(t.oppDetail.acceptedCount, { count: opp.acceptedCount })}</Badge>}
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {reviews.length === 0 ? (
              <p className="text-sm text-muted">{t.oppDetail.noReviews}</p>
            ) : (
              reviews.map((r) => (
                <Card key={r.id} className="p-4">
                  <div className="flex items-center gap-2">
                    <Badge tone={r.outcome === "ACCEPTED" ? "success" : r.outcome === "REJECTED" ? "muted" : "neutral"}>
                      {REVIEW_OUTCOME_LABELS[r.outcome] ?? r.outcome}
                    </Badge>
                    {r.rating && <span className="text-sm text-warning">{"★".repeat(r.rating)}</span>}
                    <span className="ml-auto text-xs text-muted">{formatDate(r.createdAt)}</span>
                  </div>
                  {r.comment && <p className="mt-2 whitespace-pre-wrap text-sm">{r.comment}</p>}
                </Card>
              ))
            )}
          </div>
          {user && (
            <div>
              <ReviewForm opportunityId={opp.id} existing={myReview} locale={locale} />
            </div>
          )}
        </div>
      </section>

      {exactSimilar.length > 0 && (
        <section className={styles.lowerSection}>
          <h2 className="text-xl font-semibold">{t.oppDetail.similar}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {exactSimilar.map((s) => (
              <OpportunityCard key={s.id} opp={s} showSave={!!user} />
            ))}
          </div>
        </section>
      )}
      </div>
    </main>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-muted">{icon} {label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
