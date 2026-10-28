import { describe, it, expect } from "vitest";
import { assessAutoPublication, candidateSchema, shouldAutoPublish, shouldAutoPublishParsedTelegram, shouldFlagCandidateSuspicious, computeTrust, sourceAccessScope, type Candidate } from "@/lib/ingest-rules";

/**
 * Auto-publish bypasses the moderator, so its gate is safety-critical: every
 * every provenance, freshness and rights condition must hold, and
 * social/scraped sources must never qualify no matter how confident the parse.
 */

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    title: "Республиканская олимпиада по информатике",
    shortDescription: "Отбор для 8–11 классов",
    fullDescription: "Полное описание олимпиады с условиями участия.",
    categorySlug: "olympiad",
    tags: [],
    organizerName: "Министерство просвещения РК",
    audienceStatus: "SCHOOL",
    audienceEvidence: "8–11 классов",
    country: "Kazakhstan",
    format: "ONLINE",
    price: 0,
    sourceUrl: "https://gov.kz/olympiad",
    applicationUrl: "https://gov.kz/olympiad/apply",
    applicationDeadline: "2030-03-20T23:59:00+05:00",
    requiredDocuments: [],
    requirements: ["Ученик 8–11 класса"],
    media: [
      {
        kind: "IMAGE",
        url: "https://extravity.public.blob.vercel-storage.com/opportunity-media/test.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 128_000,
        position: 0,
        checksum: "a".repeat(64),
        platformMediaId: "test-photo",
        rightsState: "APPROVED",
        rightsBasis: "ORGANIZER_OWNED",
        rightsEvidenceUrl: "https://gov.kz/media-terms",
      },
    ],
    originalLanguage: "ru",
    confidence: 0.85,
    ...overrides,
  };
}

const context = {
  connectorUrl: "https://gov.kz/opportunities",
  approvedSourceOrigins: new Set(["https://gov.kz"]),
  eligibilityReviewEvidenceRef: "approved-rulebook-2026",
  now: new Date("2026-09-26T12:00:00Z"),
};

const canPublish = (type: string, item: Candidate, trust: number) =>
  shouldAutoPublish(type, item, trust, context);

describe("sourceAccessScope", () => {
  it("marks subscribed private Telegram posts as private", () => {
    expect(sourceAccessScope("https://t.me/c/123/42")).toBe("PRIVATE");
    expect(sourceAccessScope("https://t.me/+ZcPwXZn_A2ZiMDUy")).toBe("PRIVATE");
    expect(sourceAccessScope("https://t.me/joinchat/secret")).toBe("PRIVATE");
    expect(sourceAccessScope("https://chat.whatsapp.com/secret")).toBe("PRIVATE");
    expect(sourceAccessScope("https://t.me/public_channel/42")).toBe("PUBLIC");
  });
});

describe("shouldAutoPublishParsedTelegram", () => {
  it("accepts only a public post whose complete media set is in the Telegram archive", () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://extravity.vercel.app";
    const checksum = "b".repeat(64);
    const item = candidate({
      sourceUrl: "https://t.me/official_channel/42",
      sourcePublishedAt: new Date().toISOString(),
      shortDescription: "Открыта регистрация для школьников 8–11 классов",
      applicationUrl: "https://apply.example.org/physics",
      media: [{
        kind: "IMAGE",
        url: `https://extravity.vercel.app/api/telegram-media/${checksum}`,
        storageKey: "telegram-archive:v1:-1001234567890:42:AQAD0123456789abcdefghij",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        position: 0,
        checksum,
        platformMediaId: "photo-42",
      }],
    });
    expect(shouldAutoPublishParsedTelegram("telegram", item)).toBe(true);
    expect(shouldAutoPublishParsedTelegram("instagram", item)).toBe(false);
    expect(shouldAutoPublishParsedTelegram("telegram", { ...item, sourceUrl: "https://t.me/c/123/42" })).toBe(false);
    expect(shouldAutoPublishParsedTelegram("telegram", { ...item, media: [] })).toBe(false);
    expect(shouldAutoPublishParsedTelegram("telegram", { ...item, sourcePublishedAt: undefined })).toBe(false);
    expect(shouldAutoPublishParsedTelegram("telegram", {
      ...item,
      applicationDeadline: undefined,
      applicationUrl: undefined,
    })).toBe(false);
    expect(shouldAutoPublishParsedTelegram("telegram", {
      ...item,
      applicationDeadline: undefined,
      sourcePublishedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    })).toBe(false);
    expect(shouldAutoPublishParsedTelegram("telegram", {
      ...item,
      shortDescription: "Итоги олимпиады и фотографии победителей",
      fullDescription: "Мероприятие состоялось вчера.",
    })).toBe(false);
    expect(shouldAutoPublishParsedTelegram("telegram", {
      ...item,
      applicationDeadline: undefined,
      eventStartDate: "2020-10-23T23:59:00+05:00",
    })).toBe(false);
    expect(shouldAutoPublishParsedTelegram("telegram", {
      ...item,
      applicationUrl: "https://t.me/official_channel/43",
    })).toBe(false);
    expect(shouldAutoPublishParsedTelegram("telegram", {
      ...item,
      title: "Highlights from the leadership seminar",
    })).toBe(false);
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
  });
});

describe("shouldAutoPublish", () => {
  it("requires explicit evidence of the intended audience", () => {
    const item = candidate({ audienceStatus: "UNKNOWN", audienceEvidence: undefined });
    expect(assessAutoPublication("government", item, 90, context).blockers).toContain("audience_unverified");
  });
  it("allows an adult-only opportunity when its audience is explicit", () => {
    const item = candidate({
      audienceStatus: "NON_SCHOOL",
      audienceEvidence: "participants ages 18+",
      minimumAge: 18,
      requirements: ["Participants ages 18+"],
    });
    expect(assessAutoPublication("government", item, 90, context).blockers).not.toContain("audience_unverified");
    expect(canPublish("government", item, 90)).toBe(true);
  });
  it("keeps otherwise complete items in review without recorded eligibility evidence", () => {
    const unreviewedContext = { ...context, eligibilityReviewEvidenceRef: undefined };
    expect(assessAutoPublication("government", candidate(), 90, unreviewedContext).blockers).toContain("eligibility_review_missing");
  });
  it("passes a strong candidate from an official source", () => {
    const item = candidate();
    const trust = computeTrust("government", item);
    expect(trust).toBeGreaterThanOrEqual(70);
    expect(canPublish("government", item, trust)).toBe(true);
  });

  it("requires explicit country, format and participation price, including when free", () => {
    for (const [field, blocker] of [
      ["country", "country_missing"],
      ["format", "format_missing"],
      ["price", "price_missing"],
    ] as const) {
      const item = candidate({ [field]: undefined });
      expect(assessAutoPublication("government", item, 90, context).blockers).toContain(blocker);
    }
    expect(canPublish("government", candidate({ price: 0 }), 90)).toBe(true);
  });

  it("never auto-publishes a Telegram forward, however confident", () => {
    const item = candidate({ confidence: 0.99 });
    expect(canPublish("telegram_forward", item, 95)).toBe(false);
  });

  it("never auto-publishes an Instagram post", () => {
    const item = candidate({ confidence: 0.99 });
    expect(canPublish("instagram", item, 95)).toBe(false);
  });

  it("never auto-publishes a WhatsApp export", () => {
    const item = candidate({ confidence: 0.99 });
    expect(canPublish("whatsapp_export", item, 95)).toBe(false);
    expect(computeTrust("whatsapp_export", item)).toBeLessThan(70);
  });

  it("never auto-publishes a plain scraped page (text tier / opengraph)", () => {
    const item = candidate();
    expect(canPublish("official_site", item, 90)).toBe(true); // official_site is allowed
    expect(canPublish("html", item, 90)).toBe(false); // generic scrape is not
  });

  it("requires a deadline", () => {
    const item = candidate({ applicationDeadline: undefined });
    expect(canPublish("government", item, 90)).toBe(false);
  });

  it("requires an apply link", () => {
    const item = candidate({ applicationUrl: undefined });
    expect(canPublish("government", item, 90)).toBe(false);
  });

  it("requires at least one stored media item", () => {
    const item = candidate({ media: [] });
    expect(canPublish("government", item, 90)).toBe(false);
  });

  it("requires confidence at least 0.8", () => {
    expect(canPublish("government", candidate({ confidence: 0.79 }), 90)).toBe(false);
    expect(canPublish("government", candidate({ confidence: 0.8 }), 90)).toBe(true);
  });

  it("requires trust at least 70", () => {
    const item = candidate();
    expect(canPublish("rss", item, 69)).toBe(false);
    expect(canPublish("rss", item, 70)).toBe(true);
  });

  it("a suspicious 'guarantee' title tanks trust below the bar", () => {
    // computeTrust subtracts 30 for guarantee-language — the safety net.
    const scammy = candidate({ title: "Гарантированное поступление 100%" });
    const trust = computeTrust("government", scammy);
    expect(canPublish("government", scammy, trust)).toBe(false);
  });

  it("requires an explicit allowlist entry for the connector origin", () => {
    const result = assessAutoPublication("government", candidate(), 90, {
      ...context,
      approvedSourceOrigins: new Set(),
    });
    expect(result.blockers).toContain("source_origin_not_approved");
  });

  it("rejects a social source disguised as an official connector", () => {
    const result = assessAutoPublication(
      "government",
      candidate({ sourceUrl: "https://t.me/some_channel/123" }),
      90,
      context,
    );
    expect(result.blockers).toContain("source_origin_mismatch");
  });

  it("rejects expired opportunities", () => {
    const result = assessAutoPublication(
      "government",
      candidate({ applicationDeadline: "2026-09-25T23:59:00+05:00" }),
      90,
      context,
    );
    expect(result.blockers).toContain("deadline_missing_or_expired");
  });

  it("requires explicit media usage rights", () => {
    const media = candidate().media.map((item) => ({
      ...item,
      rightsState: undefined,
      rightsBasis: undefined,
      rightsEvidenceUrl: undefined,
    }));
    const result = assessAutoPublication("government", candidate({ media }), 90, context);
    expect(result.blockers).toContain("licensed_media_missing");
  });

  it("rejects generated fallback media in incoming candidates", () => {
    const incoming = candidate();
    expect(candidateSchema.safeParse({
      ...incoming,
      media: incoming.media.map((item) => ({ ...item, rightsState: "LICENSED_FALLBACK" })),
    }).success).toBe(false);
  });

  it("rejects Telegram and Instagram links as application destinations", () => {
    for (const applicationUrl of ["https://t.me/example/1", "https://www.instagram.com/p/example/"]) {
      const result = assessAutoPublication("government", candidate({ applicationUrl }), 90, context);
      expect(result.blockers).toContain("application_url_missing_or_indirect");
    }
  });

  it("rejects generic social-copy titles", () => {
    const result = assessAutoPublication("government", candidate({ title: "Всем привет!" }), 90, context);
    expect(result.blockers).toContain("title_not_specific");
  });

  it("keeps recaps and partnership news out of the open catalog even from an approved source", () => {
    for (const title of [
      "В Астане состоялся AI-хакатон HackAlem",
      "Стартап-чайхана стала информационным партнёром AWS Innovation Day",
    ]) {
      const item = candidate({ title });
      expect(assessAutoPublication("government", item, 90, context).blockers).toContain("content_not_open_opportunity");
      expect(shouldFlagCandidateSuspicious(item, 90)).toBe(true);
    }
  });

  it("keeps a concrete open competition in the normal review queue", () => {
    expect(shouldFlagCandidateSuspicious(candidate(), 90)).toBe(false);
  });

  it("does not flag an open competition when its description mentions last year's result", () => {
    const item = candidate({ fullDescription: "В прошлом году конкурс прошёл успешно. Регистрация на новый сезон открыта." });
    expect(shouldFlagCandidateSuspicious(item, 90)).toBe(false);
    expect(assessAutoPublication("government", item, 90, context).allowed).toBe(true);
  });
});
