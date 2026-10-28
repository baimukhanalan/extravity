import type { Prisma } from "@prisma/client";
import { publicSourceMediaWhere } from "./source-media-provenance";
import { publicExpiredCutoff } from "./opportunity-freshness";

export const unresolvedPublicReviewPrefixes = [
  "Требует проверки перед публикацией:",
  "Условия извлечены автоматически из публичной Telegram-публикации и ещё проверяются.",
] as const;

type PublicModerationState = {
  shortDescription?: string | null;
  fullDescription?: string | null;
  provenance?: { adminOnlyJson: unknown } | null;
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function hasResolvedPublicModeration(opportunity: PublicModerationState): boolean {
  const provenance = jsonObject(opportunity.provenance?.adminOnlyJson);
  return provenance.publicListingMode !== "parsed_unverified"
    && provenance.applicationDisabled !== true
    && !unresolvedPublicReviewPrefixes.some((prefix) =>
      (opportunity.shortDescription ?? "").startsWith(prefix) || (opportunity.fullDescription ?? "").startsWith(prefix));
}

export function isParsedPublicListing(opportunity: PublicModerationState): boolean {
  return jsonObject(opportunity.provenance?.adminOnlyJson).publicListingMode === "parsed_unverified";
}

export function hasPublicCatalogApproval(opportunity: PublicModerationState): boolean {
  if (hasResolvedPublicModeration(opportunity)) return true;
  return isParsedPublicListing(opportunity);
}

export function retainResolvedPublicOpportunities<TOpportunity extends PublicModerationState>(
  opportunities: TOpportunity[],
): TOpportunity[] {
  return opportunities.filter(hasResolvedPublicModeration);
}

export function retainPublicCatalogOpportunities<TOpportunity extends PublicModerationState>(
  opportunities: TOpportunity[],
): TOpportunity[] {
  return opportunities.filter(hasPublicCatalogApproval);
}

/**
 * The single visibility boundary for every public opportunity surface.
 * Knowing a slug must never reveal a pending or rejected record.
 */
export function publicOpportunityWhere(now: Date = new Date()): Prisma.OpportunityWhereInput {
  return {
    deletedAt: null,
    sourceType: { in: ["telegram", "telegram_forward"] },
    sourceUrl: { startsWith: "https://t.me/" },
    provenance: { is: { accessScope: "PUBLIC" } },
    status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON", "SUSPICIOUS", "CLOSED", "COMPLETED"] },
    OR: [
      { applicationDeadline: null },
      { applicationDeadline: { gt: publicExpiredCutoff(now) } },
    ],
    moderationStatus: "APPROVED",
    media: { some: publicSourceMediaWhere },
  };
}

export function activePublicOpportunityWhere(now: Date = new Date()): Prisma.OpportunityWhereInput {
  return {
    ...publicOpportunityWhere(now),
    status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON", "SUSPICIOUS"] },
    OR: [
      { applicationDeadline: null },
      { applicationDeadline: { gt: now } },
    ],
  };
}

export function standardActiveOpportunityWhere(now: Date = new Date()): Prisma.OpportunityWhereInput {
  return {
    ...activePublicOpportunityWhere(now),
    status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"] },
    NOT: unresolvedPublicReviewPrefixes.flatMap((prefix) => [
      { shortDescription: { startsWith: prefix } },
      { fullDescription: { startsWith: prefix } },
    ]),
  };
}

export function savedPublicOpportunityWhere(userId: string, now: Date = new Date()): Prisma.SavedOpportunityWhereInput {
  return { userId, opportunity: publicOpportunityWhere(now) };
}
