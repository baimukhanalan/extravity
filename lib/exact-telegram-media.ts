import { isOriginalTelegramPostMedia } from "./source-media-provenance";

type TelegramMediaCandidate = {
  url?: string | null;
  storageKey?: string | null;
  platformMediaId?: string | null;
  processingState: string;
  rightsState: string;
  rightsEvidenceRef?: string | null;
};

type OpportunityWithMedia<TMedia extends TelegramMediaCandidate> = {
  sourceUrl: string | null;
  media: TMedia[];
};

export function retainExactTelegramMedia<
  TMedia extends TelegramMediaCandidate,
  TOpportunity extends OpportunityWithMedia<TMedia>,
>(opportunity: TOpportunity): TOpportunity | null {
  const media = opportunity.media.filter((item) => isOriginalTelegramPostMedia(opportunity.sourceUrl, item));
  return media.length > 0 ? { ...opportunity, media } : null;
}

export function retainOpportunitiesWithExactTelegramMedia<
  TMedia extends TelegramMediaCandidate,
  TOpportunity extends OpportunityWithMedia<TMedia>,
>(opportunities: TOpportunity[]): TOpportunity[] {
  return opportunities.flatMap((opportunity) => {
    const retained = retainExactTelegramMedia(opportunity);
    return retained ? [retained] : [];
  });
}
