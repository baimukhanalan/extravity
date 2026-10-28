import { describe, expect, it } from "vitest";
import {
  activePublicOpportunityWhere,
  hasPublicCatalogApproval,
  hasResolvedPublicModeration,
  publicOpportunityWhere,
  retainPublicCatalogOpportunities,
  retainResolvedPublicOpportunities,
  savedPublicOpportunityWhere,
  standardActiveOpportunityWhere,
  unresolvedPublicReviewPrefixes,
} from "@/lib/public-opportunity";

describe("public opportunity visibility", () => {
  it("fails closed unless moderation and usable media are approved", () => {
    const now = new Date("2026-09-27T00:00:00.000Z");
    expect(publicOpportunityWhere(now)).toMatchObject({
      deletedAt: null,
      sourceType: { in: ["telegram", "telegram_forward"] },
      sourceUrl: { startsWith: "https://t.me/" },
      provenance: { is: { accessScope: "PUBLIC" } },
      moderationStatus: "APPROVED",
      status: { in: expect.arrayContaining(["PUBLISHED", "REGISTRATION_OPEN", "CLOSED"]) },
      OR: [
        { applicationDeadline: null },
        { applicationDeadline: { gt: new Date("2026-09-17T00:00:00.000Z") } },
      ],
      media: {
        some: {
          processingState: "READY",
          rightsState: "SOURCE_POST",
          rightsEvidenceRef: { startsWith: "https://t.me/" },
        },
      },
    });
  });

  it("lists parsed public records without requiring a complete application dataset", () => {
    const complete = {
      shortDescription: "Проверенная возможность",
      fullDescription: "Все существенные условия проверены.",
      provenance: { adminOnlyJson: {} },
    };
    expect(hasResolvedPublicModeration(complete)).toBe(true);
    expect(hasResolvedPublicModeration({
      ...complete,
      provenance: { adminOnlyJson: { publicListingMode: "parsed_unverified" } },
    })).toBe(false);
    const parsedListing = {
      ...complete,
      provenance: { adminOnlyJson: { publicListingMode: "parsed_unverified", applicationDisabled: false } },
    };
    expect(hasPublicCatalogApproval(parsedListing)).toBe(true);
    expect(hasPublicCatalogApproval({
      ...parsedListing,
      provenance: { adminOnlyJson: { publicListingMode: "parsed_unverified", applicationDisabled: true } },
    })).toBe(true);
    expect(retainPublicCatalogOpportunities([complete, parsedListing])).toEqual([complete, parsedListing]);
    expect(hasResolvedPublicModeration({
      ...complete,
      provenance: { adminOnlyJson: { applicationDisabled: true } },
    })).toBe(false);
    expect(retainResolvedPublicOpportunities([
      complete,
      { ...complete, shortDescription: `${unresolvedPublicReviewPrefixes[0]} price.` },
    ])).toEqual([complete]);
  });

  it("excludes a public expired card once the ten-day grace window ends", () => {
    const now = new Date("2026-09-27T00:00:00.000Z");
    expect(publicOpportunityWhere(now)).toMatchObject({
      OR: [
        { applicationDeadline: null },
        { applicationDeadline: { gt: new Date("2026-09-17T00:00:00.000Z") } },
      ],
    });
  });

  it("counts only currently applyable public cards as active coverage", () => {
    const now = new Date("2026-09-27T00:00:00.000Z");
    expect(activePublicOpportunityWhere(now)).toMatchObject({
      deletedAt: null,
      moderationStatus: "APPROVED",
      status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON", "SUSPICIOUS"] },
      OR: [
        { applicationDeadline: null },
        { applicationDeadline: { gt: now } },
      ],
      media: {
        some: {
          processingState: "READY",
          rightsState: "SOURCE_POST",
          rightsEvidenceRef: { startsWith: "https://t.me/" },
        },
      },
    });
  });

  it("keeps the personal feed to approved, media-backed, open standard listings", () => {
    const now = new Date("2026-09-27T00:00:00.000Z");
    expect(standardActiveOpportunityWhere(now)).toMatchObject({
      deletedAt: null,
      moderationStatus: "APPROVED",
      status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"] },
      OR: [
        { applicationDeadline: null },
        { applicationDeadline: { gt: now } },
      ],
      media: {
        some: {
          processingState: "READY",
          rightsState: "SOURCE_POST",
          rightsEvidenceRef: { startsWith: "https://t.me/" },
        },
      },
    });
  });

  it("hides saved cards that no longer satisfy the public media boundary", () => {
    const now = new Date("2026-09-27T00:00:00.000Z");
    expect(savedPublicOpportunityWhere("student-1", now)).toEqual({
      userId: "student-1",
      opportunity: publicOpportunityWhere(now),
    });
  });
});
