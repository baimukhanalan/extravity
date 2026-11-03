import { describe, expect, it } from "vitest";
import { parsedTelegramReleaseBlockers } from "../lib/parsed-telegram-release-gate";

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
