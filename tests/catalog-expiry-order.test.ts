import { describe, expect, it } from "vitest";
import { prioritizeCurrentCatalogItems } from "@/lib/catalog-order";

describe("catalog expiry ordering", () => {
  it("keeps the selected order within each group but always places expired cards last", () => {
    const now = new Date("2026-10-23T12:00:00.000Z");
    const items = [
      { id: "expired-featured", applicationDeadline: "2026-10-22T12:00:00.000Z" },
      { id: "current-first", applicationDeadline: "2026-10-24T12:00:00.000Z" },
      { id: "expired-second", applicationDeadline: "2026-10-20T12:00:00.000Z" },
      { id: "current-second", applicationDeadline: "2026-11-01T12:00:00.000Z" },
    ];

    expect(prioritizeCurrentCatalogItems(items, now).map((item) => item.id)).toEqual([
      "current-first",
      "current-second",
      "expired-featured",
      "expired-second",
    ]);
  });
});
