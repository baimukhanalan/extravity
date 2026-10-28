import { describe, expect, it } from "vitest";
import { canonicalApplicationUrl, likelySamePublishedOpportunity, duplicateReviewFromProvenance } from "@/lib/ingest-duplicate";

const original = {
  id: "published-1",
  title: "International Physics Olympiad 2026",
  organizerName: "Physics Society",
  applicationUrl: "https://www.apply.example.org/olympiad?utm_source=site&event=2026",
  applicationDeadline: new Date("2030-05-01T12:00:00.000Z"),
};

describe("cross-post duplicate guard", () => {
  it("ignores tracking but preserves event-defining form parameters", () => {
    expect(canonicalApplicationUrl("https://apply.example.org/olympiad?event=2026&ref=tg&utm_campaign=launch"))
      .toBe("apply.example.org/olympiad?event=2026");
    expect(canonicalApplicationUrl("https://apply.example.org/olympiad?event=2027"))
      .not.toBe(canonicalApplicationUrl(original.applicationUrl));
  });

  it("flags the same event from another post with a referral URL", () => {
    expect(likelySamePublishedOpportunity({
      title: "International Physics Olympiad 2026 — applications open",
      organizerName: "Different Channel",
      applicationUrl: "https://apply.example.org/olympiad?event=2026&ref=telegram",
      applicationDeadline: new Date("2030-05-01T12:00:00.000Z"),
    }, original)).toBe(true);
  });

  it("does not conflate separate events using the same generic form or a later season", () => {
    expect(likelySamePublishedOpportunity({
      title: "Math Essay Contest 2026",
      organizerName: "Physics Society",
      applicationUrl: "https://apply.example.org/olympiad?event=2026&ref=telegram",
      applicationDeadline: new Date("2030-05-01T12:00:00.000Z"),
    }, original)).toBe(false);
    expect(likelySamePublishedOpportunity({
      ...original, title: "International Physics Olympiad 2027",
      applicationDeadline: new Date("2031-05-01T12:00:00.000Z"),
    }, original)).toBe(false);
  });

  it("flags HSACC across organizer form subdomain and renamed title, but not a shared form provider", () => {
    const published = { ...original, title: "Harvard Student Agencies Case Competition 2026",
      applicationUrl: "https://highschoolcasecomp.org/register" };
    const candidate = { title: "Harvard Student Case Competition 2026",
      organizerName: "Harvard Student Agencies",
      applicationUrl: "https://forms.highschoolcasecomp.org/registration?utm_source=telegram",
      applicationDeadline: new Date("2030-05-01T12:00:00.000Z") };
    expect(likelySamePublishedOpportunity(candidate, published)).toBe(true);
    expect(likelySamePublishedOpportunity({ ...candidate, applicationUrl: "https://forms.google.com/registration" },
      { ...published, applicationUrl: "https://forms.google.com/register" })).toBe(false);
  });

  it("preserves the unresolved review state from admin-only provenance", () => {
    expect(duplicateReviewFromProvenance({ potentialDuplicate: {
      matchedOpportunityId: "published-1", reason: "matching_published_event",
    } })).toEqual({ matchedOpportunityId: "published-1", reason: "matching_published_event" });
    expect(duplicateReviewFromProvenance({ potentialDuplicate: { matchedOpportunityId: 1 } })).toBeNull();
    expect(duplicateReviewFromProvenance({ duplicateOfOpportunityId: "published-1" })).toEqual({
      matchedOpportunityId: "published-1", reason: "known_duplicate",
    });
  });
});
