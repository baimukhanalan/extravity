import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { opportunity: { findMany: mocks.findMany } },
}));

import { unresolvedPublicReviewPrefixes } from "@/lib/public-opportunity";
import { getFeed } from "@/lib/recommendations";

describe("recommendation public boundary", () => {
  beforeEach(() => mocks.findMany.mockReset());

  it("queries recommendations through the fail-closed public moderation filter", async () => {
    mocks.findMany.mockResolvedValue([]);

    await getFeed(null);

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        moderationStatus: "APPROVED",
        status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"] },
        OR: [
          { applicationDeadline: null },
          { applicationDeadline: { gt: expect.any(Date) } },
        ],
        NOT: unresolvedPublicReviewPrefixes.flatMap((prefix) => [
          { shortDescription: { startsWith: prefix } },
          { fullDescription: { startsWith: prefix } },
        ]),
      }),
    }));
  });
});
