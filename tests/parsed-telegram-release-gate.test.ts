import { describe, expect, it } from "vitest";
import { isOfficiallyReviewedTelegramRelease, parsedTelegramReleaseBlockers } from "../lib/parsed-telegram-release-gate";

const reviewed = {
  applicationUrl: "https://example.org/register",
  country: "Kazakhstan",
  tags: ["школьники"],
  provenance: {
    audienceStatus: "SCHOOL",
    audienceEvidence: "ученики 8–11 классов",
    organizerEvidence: "SOURCE_TEXT",
    ingestUnknownTerms: [],
  },
};

describe("parsed Telegram release terms", () => {
  it("accepts explicit school, organizer, material and application evidence", () => {
    expect(parsedTelegramReleaseBlockers(reviewed)).toEqual([]);
  });

  it("blocks a school post when the participation price is unknown", () => {
    expect(parsedTelegramReleaseBlockers({
      ...reviewed,
      provenance: { ...reviewed.provenance, ingestUnknownTerms: ["price"] },
    })).toContain("material_terms_unverified");
  });

  it("blocks a foreign-restricted post even when it mentions school pupils", () => {
    expect(parsedTelegramReleaseBlockers({
      ...reviewed,
      tags: ["школьники", "география ограничена"],
    })).toContain("kazakhstan_eligibility_restricted");
  });

  it("blocks unknown audiences and indirect application links", () => {
    const blockers = parsedTelegramReleaseBlockers({
      ...reviewed,
      applicationUrl: "https://t.me/some_channel/123",
      provenance: { ...reviewed.provenance, audienceStatus: "UNKNOWN" },
    });
    expect(blockers).toContain("school_audience_unverified");
    expect(blockers).toContain("direct_application_url_missing");
  });
});

describe("officially reviewed Telegram release marker", () => {
  const evidence = {
    verifiedAt: new Date("2020-01-01T00:00:00.000Z"),
    organizerVerified: "VERIFIED",
    provenance: {
      publicListingMode: "officially_reviewed",
      reviewedAt: "2020-01-01T00:00:00.000Z",
      officialPage: "https://organizer.example.org/event",
      organizerOfficialEvidence: "https://organizer.example.org/event",
      priceEvidenceUrl: "https://organizer.example.org/event",
      priceEvidenceText: "19,000 KZT",
      deadlineEvidence: "Original post and organizer page",
      countryEvidence: "Organizer page",
      audienceStatus: "SCHOOL",
      organizerEvidence: "SOURCE_TEXT",
      ingestUnknownTerms: [],
    },
  };

  it("preserves a manually reviewed listing with explicit official evidence", () => {
    expect(isOfficiallyReviewedTelegramRelease(evidence)).toBe(true);
  });

  it("keeps parsed cards unverified when the explicit marker or evidence is missing", () => {
    expect(isOfficiallyReviewedTelegramRelease({
      ...evidence, provenance: { ...evidence.provenance, publicListingMode: "parsed_unverified" },
    })).toBe(false);
    expect(isOfficiallyReviewedTelegramRelease({
      ...evidence, provenance: { ...evidence.provenance, priceEvidenceText: "" },
    })).toBe(false);
    expect(isOfficiallyReviewedTelegramRelease({
      ...evidence, provenance: { ...evidence.provenance, ingestUnknownTerms: ["country"] },
    })).toBe(false);
  });
});
