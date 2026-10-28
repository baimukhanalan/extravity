import { describe, expect, it } from "vitest";
import { publicationGate } from "@/lib/opportunity-publication";
import { duplicateReviewFromProvenance } from "@/lib/ingest-duplicate";

const base = {
  applicationUrl: "https://example.org/apply",
  applicationDeadline: new Date("2030-01-01T00:00:00.000Z"),
  moderationStatus: "APPROVED",
  organizerName: "Organizer",
  sourceType: "telegram",
  sourceUrl: "https://t.me/source/42",
  audienceStatus: "SCHOOL" as const,
  media: [{ processingState: "READY" as const, rightsState: "SOURCE_POST" as const, rightsEvidenceRef: "https://t.me/source/42", platformMediaId: "tg-photo-42" }],
  now: new Date("2026-09-26T00:00:00.000Z"),
};

describe("opportunity publication gate", () => {
  it("allows a complete moderated opportunity", () => {
    expect(publicationGate(base)).toEqual({ allowed: true, reasons: [] });
  });

  it("blocks a possible published duplicate until distinctness is reviewed", () => {
    expect(publicationGate({ ...base, duplicateReviewRequired: true })).toEqual({
      allowed: false, reasons: ["potential_duplicate_review_required"],
    });
  });

  it("blocks a pre-existing duplicate marker until it receives a distinctness review", () => {
    const review = duplicateReviewFromProvenance({ duplicateOfOpportunityId: "published-1" });
    expect(publicationGate({ ...base, duplicateReviewRequired: Boolean(review && !review.resolvedAt) }).reasons)
      .toContain("potential_duplicate_review_required");
  });

  it("blocks publication without approved ready media", () => {
    const result = publicationGate({ ...base, media: [{ processingState: "READY", rightsState: "PENDING" }] });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("approved_media_missing");
    expect(publicationGate({ ...base, media: [{ processingState: "READY", rightsState: "APPROVED" }] }).reasons)
      .toContain("approved_media_missing");
    expect(publicationGate({ ...base, media: [{ processingState: "READY", rightsState: "LICENSED_FALLBACK", rightsEvidenceRef: "generated" }] }).reasons)
      .toContain("approved_media_missing");
    expect(publicationGate({ ...base, media: [{ processingState: "READY", rightsState: "SOURCE_POST", rightsEvidenceRef: "https://t.me/source/42", platformMediaId: "tg-photo-42" }] }).allowed)
      .toBe(true);
  });

  it("rejects generated, licensed, or unrelated media even if relabeled approved", () => {
    expect(publicationGate({ ...base, media: [{ processingState: "READY", rightsState: "APPROVED", rightsEvidenceRef: "organizer license", platformMediaId: "extravity-generated:old:v1" }] }).reasons)
      .toContain("approved_media_missing");
    expect(publicationGate({ ...base, media: [{ processingState: "READY", rightsState: "APPROVED", rightsEvidenceRef: "organizer license", url: "/opportunity-covers/old.png" }] }).reasons)
      .toContain("approved_media_missing");
    expect(publicationGate({ ...base, media: [{ processingState: "READY", rightsState: "APPROVED", rightsEvidenceRef: "organizer license", url: "/source-media/original.jpg" }] }).allowed)
      .toBe(false);
  });

  it("blocks expired or incomplete application destinations", () => {
    const result = publicationGate({ ...base, applicationUrl: null, applicationDeadline: new Date("2020-01-01T00:00:00.000Z") });
    expect(result.reasons).toContain("application_url_missing");
    expect(result.reasons).toContain("deadline_expired");
  });

  it("blocks malformed or source-post URLs", () => {
    expect(publicationGate({ ...base, applicationUrl: "javascript:alert(1)" }).reasons).toContain("application_url_invalid");
    expect(publicationGate({ ...base, sourceUrl: "https://t.me/source/42", applicationUrl: "https://t.me/source/42/" }).reasons)
      .toContain("application_url_matches_source");
  });

  it("blocks a risky news item even when its technical fields are complete", () => {
    const result = publicationGate({ ...base, title: "Freedom объявил новый фонд", confidenceScore: 90 });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("content_resembles_news");
  });
});
