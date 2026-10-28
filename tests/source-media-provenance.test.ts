import { describe, expect, it } from "vitest";
import { isKnownExtravityGeneratedMedia, isOriginalTelegramPostMedia, isPublicTelegramPostUrl, publicSourceMediaWhere } from "@/lib/source-media-provenance";

describe("source media provenance", () => {
  it("recognizes old Extravity illustrations even if their rights state is later changed", () => {
    expect(isKnownExtravityGeneratedMedia({ platformMediaId: "extravity-generated:ssr-global-research-challenge-2026:v1" })).toBe(true);
    expect(isKnownExtravityGeneratedMedia({ url: "/opportunity-covers/hsacc-2026.png" })).toBe(true);
    expect(isKnownExtravityGeneratedMedia({ storageKey: "public/opportunity-covers/bu-presidential-scholarship-2026.png" })).toBe(true);
    expect(isKnownExtravityGeneratedMedia({ rightsEvidenceRef: "Extravity generated illustration; built-in image generation" })).toBe(true);
  });

  it("keeps legitimate organizer-owned approved originals eligible", () => {
    expect(isKnownExtravityGeneratedMedia({
      platformMediaId: "organizer:competition:photo-1",
      url: "/source-media/competition-photo-1.jpg",
      storageKey: "public/source-media/competition-photo-1.jpg",
      rightsEvidenceRef: "Organizer permission email, 2026-09-29",
    })).toBe(false);
    expect(isKnownExtravityGeneratedMedia({
      platformMediaId: null,
      url: "https://example.org/opportunity-covers/original.jpg",
      rightsEvidenceRef: "https://example.org/media-license",
    })).toBe(false);
  });

  it("centralizes the same generated-media exclusions for all public selectors", () => {
    expect(publicSourceMediaWhere).toMatchObject({
      processingState: "READY",
      rightsState: "SOURCE_POST",
      rightsEvidenceRef: { startsWith: "https://t.me/" },
      platformMediaId: { not: null },
      AND: expect.arrayContaining([
        { NOT: { url: { startsWith: "/opportunity-covers/", mode: "insensitive" } } },
      ]),
    });
    expect(JSON.stringify(publicSourceMediaWhere)).toContain("extravity-generated:");
    expect(JSON.stringify(publicSourceMediaWhere)).toContain("built-in image generation");
  });

  it("requires an original file tied to the exact public Telegram post", () => {
    const sourceUrl = "https://t.me/studygrants/7301";
    const media = {
      processingState: "READY",
      rightsState: "SOURCE_POST",
      rightsEvidenceRef: sourceUrl,
      platformMediaId: "5343762163698441017",
      url: "/source-media/original.jpg",
    };
    expect(isPublicTelegramPostUrl(sourceUrl)).toBe(true);
    expect(isPublicTelegramPostUrl("https://t.me/c/123/7301")).toBe(false);
    expect(isOriginalTelegramPostMedia(sourceUrl, media)).toBe(true);
    expect(isOriginalTelegramPostMedia(sourceUrl, { ...media, rightsEvidenceRef: "https://t.me/studygrants/7302" })).toBe(false);
    expect(isOriginalTelegramPostMedia(sourceUrl, { ...media, rightsState: "APPROVED" })).toBe(false);
    expect(isOriginalTelegramPostMedia(sourceUrl, { ...media, platformMediaId: null })).toBe(false);
    expect(isOriginalTelegramPostMedia(sourceUrl, { ...media, url: "/opportunity-covers/fake.png" })).toBe(false);
  });
});
