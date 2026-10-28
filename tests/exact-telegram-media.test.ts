import { describe, expect, it } from "vitest";
import {
  retainExactTelegramMedia,
  retainOpportunitiesWithExactTelegramMedia,
} from "@/lib/exact-telegram-media";

const sourceUrl = "https://t.me/example/42";
const original = {
  url: "/api/source-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  storageKey: "railway-volume:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  platformMediaId: "telegram-photo-42",
  processingState: "READY",
  rightsState: "SOURCE_POST",
  rightsEvidenceRef: sourceUrl,
};

describe("exact Telegram media retention", () => {
  it("keeps only original media from the exact Telegram post", () => {
    const retained = retainExactTelegramMedia({
      id: "exact",
      sourceUrl,
      media: [
        original,
        { ...original, platformMediaId: "telegram-photo-41", rightsEvidenceRef: "https://t.me/example/41" },
      ],
    });

    expect(retained?.media).toEqual([original]);
  });

  it("drops opportunities with mismatched, generated, or fallback media", () => {
    const opportunities = [
      { id: "exact", sourceUrl, media: [original] },
      { id: "neighbor", sourceUrl, media: [{ ...original, rightsEvidenceRef: "https://t.me/example/41" }] },
      { id: "generated", sourceUrl, media: [{ ...original, platformMediaId: "extravity-generated:42:v1" }] },
      { id: "fallback", sourceUrl, media: [{ ...original, rightsState: "LICENSED_FALLBACK" }] },
    ];

    expect(retainOpportunitiesWithExactTelegramMedia(opportunities).map((opportunity) => opportunity.id)).toEqual(["exact"]);
  });
});
