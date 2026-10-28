import { describe, expect, it } from "vitest";
import { PUBLIC_EXPIRED_GRACE_DAYS, archiveEligibleWhere, publicExpiredCutoff, recentlyExpiredWhere } from "@/lib/opportunity-freshness";

describe("archiveEligibleWhere", () => {
  it("keeps expired opportunities public for ten days, then archives them", () => {
    const now = new Date("2026-09-29T12:00:00.000Z");
    const cutoff = new Date("2026-09-19T12:00:00.000Z");
    expect(PUBLIC_EXPIRED_GRACE_DAYS).toBe(10);
    expect(publicExpiredCutoff(now)).toEqual(cutoff);
    expect(recentlyExpiredWhere(now)).toEqual({
      status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON", "CLOSED"] },
      applicationDeadline: { gt: cutoff, lte: now },
      deletedAt: null,
    });
    expect(archiveEligibleWhere(now)).toEqual({
      status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON", "CLOSED"] },
      applicationDeadline: { lte: cutoff },
      deletedAt: null,
    });
  });
});
