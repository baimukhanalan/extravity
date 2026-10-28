import Link from "next/link";
import Image from "next/image";
import type { Category, Opportunity, OpportunityMedia, Prisma } from "@prisma/client";
import { MapPin, Users2, BadgeCheck, ShieldQuestion, Clock3, Images, BookOpenCheck, ExternalLink, UserRoundCheck } from "lucide-react";
import { ScoreRing } from "@/components/ui";
import { CategoryIcon } from "@/components/category-icon";
import { SaveButton } from "@/components/save-button";
import { deadlineLabel, formatOpportunityPrice, categoryName } from "@/lib/utils";
import type { MatchResult } from "@/lib/match";
import { getT } from "@/lib/locale";
import { getOpportunityAvailability } from "@/lib/opportunity-availability";
import { isOpportunityPriceKnown } from "@/lib/opportunity-price";
import { opportunityMediaNotice } from "@/lib/opportunity-media-notice";
import { railwayMediaDisplayUrl } from "@/lib/railway-media-display";
import { isOriginalTelegramPostMedia } from "@/lib/source-media-provenance";
import { opportunityCardFacts } from "@/lib/opportunity-card-facts";
import { isParsedPublicListing } from "@/lib/public-opportunity";
import styles from "./opportunity-card.module.css";

export type OppWithCategory = Opportunity & {
  category: Category;
  media?: OpportunityMedia[];
  provenance?: { adminOnlyJson: Prisma.JsonValue } | null;
};

export async function OpportunityCard({
  opp,
  match,
  saved = false,
  showSave = false,
}: {
  opp: OppWithCategory;
  match?: MatchResult;
  saved?: boolean;
  showSave?: boolean;
}) {
  const { t, locale } = await getT();
  const dl = deadlineLabel(opp.applicationDeadline);
  const availability = getOpportunityAvailability(opp);
  const unavailable = !availability.canApply;
  const suspicious = opp.status === "SUSPICIOUS" || opp.trustScore < 40;
  const originalMedia = opp.media?.filter((media) => isOriginalTelegramPostMedia(opp.sourceUrl, media)) ?? [];
  const cover = originalMedia[0];
  if (!cover) return null;
  const railwayUrl = railwayMediaDisplayUrl(cover);
  const mediaNotice = opportunityMediaNotice(opp.slug);
  const priceKnown = isOpportunityPriceKnown(opp);
  const facts = opportunityCardFacts(opp, locale);
  const parsedListing = isParsedPublicListing(opp);

  return (
    <article className={`${styles.card} group ${unavailable ? styles.expired : ""}`}>
      <Link href={`/opportunities/${opp.slug}`} className={styles.cover} aria-label={opp.title}>
        {cover.kind === "IMAGE" ? (
          <Image src={railwayUrl ?? cover.url} unoptimized={Boolean(railwayUrl)} alt={cover.altText ?? opp.title} fill sizes="(max-width: 600px) 100vw, (max-width: 850px) 50vw, (max-width: 1180px) 33vw, 25vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.035]" />
        ) : cover.kind === "VIDEO" ? (
          <video src={railwayUrl ?? cover.url} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-label={cover.altText ?? opp.title} />
        ) : null}
        {cover?.rightsState === "LICENSED_FALLBACK" ? (
          <span className="absolute bottom-3 left-3 z-10 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white">Иллюстрация</span>
        ) : null}
        {cover?.rightsState === "SOURCE_POST" ? (
          <span className="absolute bottom-3 left-3 z-10 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white">Медиа из публикации</span>
        ) : null}
        {mediaNotice && cover?.rightsState === "SOURCE_POST" ? (
          <span className="absolute inset-x-2 top-2 z-10 rounded-lg bg-amber-950/95 px-2 py-1.5 text-xs font-semibold leading-tight text-white">{mediaNotice}</span>
        ) : null}
        {originalMedia.length > 1 ? (
          <span className={styles.mediaCount}><Images className="h-4 w-4" aria-hidden="true" /> {originalMedia.length}</span>
        ) : null}
        {unavailable ? (
          <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-foreground/85 px-3 py-1.5 text-xs font-semibold text-background shadow-sm">
            <Clock3 className="h-3.5 w-3.5" /> {availability.expired ? t.catalog.expiredBadge : t.oppDetail.applicationClosed}
          </span>
        ) : null}
      </Link>
      <div className={styles.body}>
      <div className="flex items-start justify-between gap-3">
        <span className={styles.category}>
          <CategoryIcon name={opp.category.icon} className="h-3.5 w-3.5" />
          {categoryName(opp.category, locale)}
        </span>
        {parsedListing ? (
          <span className="rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            Условия уточняйте у организатора
          </span>
        ) : null}
        <div className="flex items-center gap-1">
          {match ? <ScoreRing score={match.score} size={44} label="%" /> : null}
          {showSave ? <SaveButton opportunityId={opp.id} initialSaved={saved} locale={locale} /> : null}
        </div>
      </div>

      <Link href={`/opportunities/${opp.slug}`} className={styles.titleLink}>
        <h2>{opp.title}</h2>
        <p>{opp.shortDescription}</p>
      </Link>

      <p className={styles.organizer}>{opp.organizerName}</p>

      <div className="mt-3 grid grid-cols-1 gap-1.5 text-xs text-muted sm:grid-cols-2">
        {facts.exam ? (
          <span className="flex items-center gap-1 font-medium text-foreground">
            <BookOpenCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> {facts.exam}
          </span>
        ) : null}
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {facts.format}
        </span>
        <span className="flex items-center gap-1">
          <UserRoundCheck className="h-3.5 w-3.5" aria-hidden="true" /> {facts.audience}
        </span>
        <span className={`flex items-center gap-1 ${facts.applicationReady ? "text-success" : "text-warning"}`}>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> {facts.application}
        </span>
        {opp.participationType === "TEAM" && (
          <span className="flex items-center gap-1">
            <Users2 className="h-3.5 w-3.5" /> {t.cabinet.oppTeam}
          </span>
        )}
        {opp.organizerVerified === "VERIFIED" ? (
          <span className="flex items-center gap-1 text-success">
            <BadgeCheck className="h-3.5 w-3.5" /> {t.cabinet.oppVerified}
          </span>
        ) : suspicious && !parsedListing ? (
          <span className="flex items-center gap-1 text-warning">
            <ShieldQuestion className="h-3.5 w-3.5" /> {t.cabinet.oppCheck}
          </span>
        ) : null}
      </div>

      <div className={styles.metaFooter}>
        <span className={`text-xs font-medium ${
          unavailable ? "text-muted line-through" : dl.tone === "danger" ? "text-danger" : dl.tone === "warning" ? "text-warning" : "text-muted"
        }`}>
          {dl.text}
        </span>
        <span className="text-sm font-semibold">
          {!priceKnown ? <span className="text-muted">{t.common.priceUnknown}</span> : opp.price === 0 ? <span className="text-success">{t.common.free}</span> : formatOpportunityPrice(opp.price, opp.currency, locale)}
        </span>
      </div>
      </div>
    </article>
  );
}
