import { describe, expect, it } from "vitest";
import { summarizeModerationQueue } from "@/lib/moderation-queue-summary";

const now = new Date("2026-09-27T00:00:00.000Z");
const base = {
  title: "Открыт набор на стажировку",
  organizerName: "Организатор",
  sourceType: "telegram",
  sourceUrl: "https://t.me/example/42",
  audienceStatus: "SCHOOL" as const,
  applicationUrl: "https://example.org/apply",
  applicationDeadline: new Date("2026-10-27T00:00:00.000Z"),
  confidenceScore: 90,
  media: [{ processingState: "READY" as const, rightsState: "PENDING" as const }],
};

describe("summarizeModerationQueue", () => {
  it("distinguishes a media-rights-only item from missing content and expired deadlines", () => {
    const summary = summarizeModerationQueue([
      base,
      { ...base, applicationUrl: null, applicationDeadline: null, media: [] },
      { ...base, applicationDeadline: new Date("2026-09-01T00:00:00.000Z") },
      { ...base, media: [{ processingState: "READY" as const, rightsState: "SOURCE_POST" as const, rightsEvidenceRef: base.sourceUrl, platformMediaId: "tg-photo-42" }] },
    ], now);

    expect(summary).toEqual({
      total: 4,
      withMedia: 3,
      missingApplicationUrl: 1,
      missingDeadline: 1,
      expiredDeadline: 1,
      missingApprovedMedia: 3,
      onlyMediaRightsPending: 1,
      otherwiseReady: 1,
    });
  });

  it("does not count a risky post as ready after media approval", () => {
    const summary = summarizeModerationQueue([
      { ...base, title: "Купи билет на стажировку со скидкой" },
    ], now);

    expect(summary.onlyMediaRightsPending).toBe(0);
    expect(summary.otherwiseReady).toBe(0);
  });
});
