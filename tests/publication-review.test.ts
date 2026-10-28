import { describe, expect, it } from "vitest";
import { publicationReviewSchema } from "@/lib/publication-review";

const complete = {
  evidenceRef: "official-rules-2026",
  organizerConfirmed: true,
  ageConfirmed: true,
  citizenshipConfirmed: true,
  priceConfirmed: true,
  deadlineConfirmed: true,
  noConflictingDeadlines: true,
  applicationRecipientConfirmed: true,
};

describe("publication review", () => {
  it("accepts a complete recorded review", () => {
    expect(publicationReviewSchema.safeParse(complete).success).toBe(true);
  });

  it("rejects missing evidence or any unchecked condition", () => {
    expect(publicationReviewSchema.safeParse({ ...complete, evidenceRef: "" }).success).toBe(false);
    for (const key of Object.keys(complete).filter((key) => key !== "evidenceRef")) {
      expect(publicationReviewSchema.safeParse({ ...complete, [key]: false }).success).toBe(false);
    }
  });

  it("accepts a reviewed unknown price without calling it free", () => {
    expect(publicationReviewSchema.safeParse({ ...complete, priceConfirmed: false, priceUnspecifiedReviewed: true }).success).toBe(true);
    expect(publicationReviewSchema.safeParse({ ...complete, priceConfirmed: true, priceUnspecifiedReviewed: true }).success).toBe(false);
  });
});
