import { describe, expect, it } from "vitest";
import { getOpportunityAvailability } from "@/lib/opportunity-availability";

const now = new Date("2026-09-26T12:00:00.000Z");
const base = {
  status: "REGISTRATION_OPEN" as const,
  moderationStatus: "APPROVED" as const,
  applicationDeadline: new Date("2026-09-27T12:00:00.000Z"),
};

describe("getOpportunityAvailability", () => {
  it("allows an approved open opportunity before its deadline", () => {
    expect(getOpportunityAvailability(base, now)).toEqual({ canApply: true, expired: false, reason: "available" });
  });

  it("blocks at the exact deadline", () => {
    expect(getOpportunityAvailability({ ...base, applicationDeadline: now }, now)).toEqual({
      canApply: false,
      expired: true,
      reason: "deadline_passed",
    });
  });

  it("allows an approved open listing when the deadline is not stated", () => {
    for (const applicationDeadline of [null, "not-a-date", new Date("invalid")]) {
      expect(getOpportunityAvailability({ ...base, applicationDeadline }, now)).toEqual({
        canApply: true,
        expired: false,
        reason: "deadline_unknown",
      });
    }
  });

  it("blocks closed and unapproved opportunities", () => {
    expect(getOpportunityAvailability({ ...base, status: "CLOSED" }, now).reason).toBe("closed");
    expect(getOpportunityAvailability({ ...base, status: "SUSPICIOUS" }, now)).toEqual({
      canApply: false,
      expired: false,
      reason: "closed",
    });
    expect(getOpportunityAvailability({ ...base, moderationStatus: "PENDING" }, now).reason).toBe("not_approved");
  });
});
