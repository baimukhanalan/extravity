import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { opportunity: { findMany: mocks.findMany } },
}));

import { getCatalog } from "@/lib/queries";

const readyMedia = {
  url: "/api/source-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  storageKey: "railway-volume:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  platformMediaId: "telegram-photo-1",
  processingState: "READY",
  rightsState: "SOURCE_POST",
};

describe("catalog exact Telegram media boundary", () => {
  beforeEach(() => mocks.findMany.mockReset());

  it("does not count a card whose media evidence belongs to another Telegram post", async () => {
    mocks.findMany
      .mockResolvedValueOnce([
        {
          id: "wrong-post",
          sourceUrl: "https://t.me/example/41",
          media: [{ ...readyMedia, rightsEvidenceRef: "https://t.me/example/42" }],
        },
        {
          id: "exact-post",
          sourceUrl: "https://t.me/example/42",
          media: [{ ...readyMedia, rightsEvidenceRef: "https://t.me/example/42" }],
        },
      ])
      .mockResolvedValueOnce([{ id: "exact-post", media: [] }]);

    const result = await getCatalog({});

    expect(result.total).toBe(1);
    expect(result.items).toEqual([{ id: "exact-post", media: [] }]);
    expect(mocks.findMany.mock.calls[1][0].where).toMatchObject({
      AND: [expect.any(Object), { id: { in: ["exact-post"] } }],
    });
  });
});
