import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sourceFindFirst: vi.fn(),
  sourceUpdate: vi.fn(),
  parserJobCreate: vi.fn(),
  parserJobUpdate: vi.fn(),
  flagFindUnique: vi.fn(),
  categoryFindUnique: vi.fn(),
  opportunityFindFirst: vi.fn(),
  opportunityFindMany: vi.fn(),
  opportunityFindUnique: vi.fn(),
  opportunityCreate: vi.fn(),
  opportunityUpdate: vi.fn(),
  opportunityUpdateMany: vi.fn(),
  mediaCreateMany: vi.fn(),
  mediaUpdateMany: vi.fn(),
  rawCreate: vi.fn(),
  rawFindFirst: vi.fn(),
  rawUpdate: vi.fn(),
  rawUpsert: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sourceConnector: { findFirst: mocks.sourceFindFirst, update: mocks.sourceUpdate },
    parserJob: { create: mocks.parserJobCreate, update: mocks.parserJobUpdate },
    featureFlag: { findUnique: mocks.flagFindUnique },
    category: { findUnique: mocks.categoryFindUnique },
    opportunity: {
      findFirst: mocks.opportunityFindFirst,
      findMany: mocks.opportunityFindMany,
      findUnique: mocks.opportunityFindUnique,
      create: mocks.opportunityCreate,
      update: mocks.opportunityUpdate,
      updateMany: mocks.opportunityUpdateMany,
    },
    opportunityMedia: { createMany: mocks.mediaCreateMany, updateMany: mocks.mediaUpdateMany },
    rawSourceItem: { create: mocks.rawCreate, findFirst: mocks.rawFindFirst, update: mocks.rawUpdate, upsert: mocks.rawUpsert },
    auditLog: { create: mocks.auditCreate },
  },
}));

import { ingestCandidates } from "@/lib/ingest";
import { candidateSchema } from "@/lib/ingest-rules";

const connector = {
  name: "Telegram: Official",
  type: "telegram",
  url: "https://t.me/official",
};

function candidate(withMedia = true) {
  return candidateSchema.parse({
    title: "Олимпиада по физике",
    shortDescription: "Открыта регистрация на олимпиаду для школьников",
    categorySlug: "olympiad",
    organizerName: "Official",
    country: "Kazakhstan",
    format: "ONLINE",
    price: 0,
    sourceUrl: "https://t.me/official/102",
    media: withMedia ? [{
      kind: "IMAGE",
      url: "https://test.public.blob.vercel-storage.com/photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
      position: 0,
      checksum: "a".repeat(64),
      platformMediaId: "photo-102",
    }] : [],
  });
}

describe("same-source ingest revalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.sourceFindFirst.mockResolvedValue({ id: "source-1" });
    mocks.sourceUpdate.mockResolvedValue({ id: "source-1" });
    mocks.parserJobCreate.mockResolvedValue({ id: "job-1" });
    mocks.flagFindUnique.mockResolvedValue(null);
    mocks.categoryFindUnique.mockResolvedValue({ id: "category-1" });
    mocks.opportunityUpdate.mockResolvedValue({});
    mocks.opportunityUpdateMany.mockResolvedValue({ count: 1 });
    mocks.opportunityFindUnique.mockResolvedValue(null);
    mocks.opportunityFindMany.mockResolvedValue([]);
    mocks.opportunityCreate.mockResolvedValue({ id: "opp-new" });
    mocks.mediaCreateMany.mockResolvedValue({ count: 1 });
    mocks.mediaUpdateMany.mockResolvedValue({ count: 1 });
    mocks.rawCreate.mockResolvedValue({});
    mocks.rawFindFirst.mockResolvedValue(null);
    mocks.rawUpdate.mockResolvedValue({});
    mocks.rawUpsert.mockResolvedValue({ processingState: "failed" });
    mocks.auditCreate.mockResolvedValue({});
    mocks.parserJobUpdate.mockResolvedValue({});
  });

  it("publishes a public Telegram candidate with exact archived media as visibly unverified", async () => {
    vi.stubEnv("AUTO_PUBLISH_PARSED_TELEGRAM", "true");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://extravity.vercel.app");
    const checksum = "b".repeat(64);
    const incoming = candidateSchema.parse({
      ...candidate(false),
      audienceStatus: "UNKNOWN",
      country: undefined,
      price: undefined,
      sourceUrl: "https://t.me/official/777",
      sourcePublishedAt: new Date().toISOString(),
      applicationUrl: "https://apply.example.org/physics",
      media: [{
        kind: "IMAGE",
        url: `https://extravity.vercel.app/api/telegram-media/${checksum}`,
        storageKey: "telegram-archive:v1:-1001234567890:777:AQAD0123456789abcdefghij",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        position: 0,
        checksum,
        platformMediaId: "photo-777",
      }],
    });

    const result = await ingestCandidates(connector, [incoming]);

    expect(result).toMatchObject({ created: 1, autoPublished: 1, suspicious: 0 });
    expect(mocks.opportunityCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: "PUBLISHED",
      moderationStatus: "APPROVED",
      verifiedAt: null,
      shortDescription: incoming.shortDescription,
      provenance: { create: expect.objectContaining({
        accessScope: "PUBLIC",
        rightsBasis: "SOURCE_POST_ATTRIBUTED",
        adminOnlyJson: expect.objectContaining({
          publicListingMode: "parsed_unverified",
          applicationDisabled: false,
          publicNotice: "Условия уточняйте у организатора.",
        }),
      }) },
      media: { create: [expect.objectContaining({
        rightsState: "SOURCE_POST",
        rightsEvidenceRef: incoming.sourceUrl,
      })] },
    }) });
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: "opportunity_published_as_parsed_unverified",
    }) });
  });

  it("refreshes only a pending public Telegram row with a future deadline", async () => {
    const incoming = { ...candidate(), applicationDeadline: "2027-01-15T23:59:59+05:00", refreshExistingPendingOnly: true };
    const result = await ingestCandidates(connector, [incoming]);
    expect(result).toMatchObject({ created: 0, duplicate: 1, refreshSkipped: 0 });
    expect(mocks.opportunityUpdateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ sourceUrl: incoming.sourceUrl, applicationDeadline: null, moderationStatus: "PENDING" }),
      data: expect.objectContaining({ applicationDeadline: new Date(incoming.applicationDeadline) }),
    });
    expect(mocks.opportunityCreate).not.toHaveBeenCalled();
    expect(mocks.opportunityUpdate).not.toHaveBeenCalled();
  });

  it("does not create a missing replay target or touch a non-pending row", async () => {
    mocks.opportunityUpdateMany.mockResolvedValue({ count: 0 });
    const result = await ingestCandidates(connector, [{ ...candidate(), applicationDeadline: "2027-01-15T23:59:59+05:00", refreshExistingPendingOnly: true }]);
    expect(result).toMatchObject({ created: 0, duplicate: 0, refreshSkipped: 1 });
    expect(mocks.opportunityCreate).not.toHaveBeenCalled();
  });

  it("rejects a replay marker for a private post or an expired deadline", async () => {
    const result = await ingestCandidates(connector, [
      { ...candidate(), sourceUrl: "https://t.me/c/123/45", applicationDeadline: "2027-01-15T23:59:59+05:00", refreshExistingPendingOnly: true },
      { ...candidate(), applicationDeadline: "2020-01-15T23:59:59+05:00", refreshExistingPendingOnly: true },
    ]);
    expect(result).toMatchObject({ created: 0, duplicate: 0, refreshSkipped: 2 });
    expect(mocks.opportunityUpdateMany).not.toHaveBeenCalled();
  });

  it("does not store candidates from private groups", async () => {
    const privateCandidate = { ...candidate(), sourceUrl: "https://t.me/c/12345/67" };
    const result = await ingestCandidates(connector, [privateCandidate]);
    expect(result.failed).toBe(1);
    expect(result.created).toBe(0);
    expect(mocks.categoryFindUnique).not.toHaveBeenCalled();
    expect(mocks.opportunityCreate).not.toHaveBeenCalled();
    expect(mocks.rawUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ processingState: "failed", attemptCount: 1 }),
    }));
  });

  it("marks a failed create as failed and reuses an existing failed raw item", async () => {
    mocks.opportunityFindFirst.mockResolvedValue(null);
    mocks.opportunityCreate.mockRejectedValue(new Error("invalid payload"));
    mocks.rawUpsert.mockResolvedValue({ processingState: "quarantined" });
    const result = await ingestCandidates(connector, [candidate()]);
    expect(result).toMatchObject({ created: 0, failed: 0, quarantined: 1 });
    expect(mocks.rawUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ processingState: "quarantined", attemptCount: { increment: 1 } }),
    }));
    expect(mocks.parserJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({ status: "partial_failure", error: "0 items failed, 1 quarantined" }),
    });
  });

  it("keeps an already quarantined item in one stable quarantine row", async () => {
    mocks.opportunityFindFirst.mockResolvedValue(null);
    mocks.opportunityCreate.mockRejectedValue(new Error("invalid payload"));
    mocks.rawUpsert.mockResolvedValue({ processingState: "quarantined" });
    const result = await ingestCandidates(connector, [candidate()]);
    expect(result).toMatchObject({ failed: 0, quarantined: 1 });
    expect(mocks.rawUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ processingState: "quarantined" }),
    }));
  });

  it("reports an unknown-category retry as quarantined instead of failed", async () => {
    mocks.categoryFindUnique.mockResolvedValue(null);
    mocks.rawUpsert.mockResolvedValue({ processingState: "quarantined" });
    const result = await ingestCandidates(connector, [candidate()]);
    expect(result).toMatchObject({ failed: 0, quarantined: 1 });
    expect(mocks.rawUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ processingState: "quarantined", error: "Unknown category: olympiad" }),
    }));
  });

  it("marks a partly successful batch as partial failure", async () => {
    mocks.opportunityFindFirst.mockResolvedValue(null);
    mocks.opportunityCreate.mockResolvedValueOnce({ id: "opp-new" }).mockRejectedValueOnce(new Error("invalid payload"));
    const second = { ...candidate(), sourceUrl: "https://t.me/official/103", contentHash: "b".repeat(64) };
    const result = await ingestCandidates(connector, [candidate(), second]);
    expect(result).toMatchObject({ created: 1, failed: 1 });
    expect(mocks.rawUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ processingState: "failed", url: second.sourceUrl, attemptCount: 1 }),
    }));
    expect(mocks.parserJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({ status: "partial_failure", error: "1 items failed" }),
    });
  });

  it("stores source-post media and its provenance instead of substituting artwork", async () => {
    const result = await ingestCandidates(connector, [candidate()]);
    expect(result.created).toBe(1);
    expect(mocks.opportunityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        media: {
          create: [expect.objectContaining({
            platformMediaId: "photo-102",
            rightsState: "SOURCE_POST",
            rightsEvidenceRef: "https://t.me/official/102",
          })],
        },
      }),
    });
  });

  it("preserves official fee evidence in admin provenance without treating foreign fees as free", async () => {
    const incoming = candidateSchema.parse({
      ...candidate(),
      price: undefined,
      priceEvidenceUrl: "https://official.example.org/opportunity",
      priceEvidenceText: "Application fee: $75",
    });
    await ingestCandidates(connector, [incoming]);
    expect(mocks.opportunityCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: "SUSPICIOUS",
      provenance: { create: expect.objectContaining({
        adminOnlyJson: expect.objectContaining({
          priceEvidenceUrl: "https://official.example.org/opportunity",
          priceEvidenceText: "Application fee: $75",
          ingestUnknownTerms: ["price"],
        }),
      }) },
    }) });
  });

  it("holds a cross-channel Telegram repost matching a published event for distinctness review", async () => {
    mocks.opportunityFindMany.mockResolvedValueOnce([{
      id: "published-1", title: "Олимпиада по физике", organizerName: "Official",
      applicationUrl: "https://apply.example.org/physics?utm_source=website",
      applicationDeadline: new Date("2030-05-01T12:00:00.000Z"),
    }]);
    const incoming = candidateSchema.parse({
      ...candidate(), sourceUrl: "https://t.me/other/899",
      applicationUrl: "https://apply.example.org/physics?utm_source=telegram&ref=channel",
      applicationDeadline: "2030-05-01T12:00:00.000Z",
    });
    const result = await ingestCandidates(connector, [incoming]);
    expect(result).toMatchObject({ created: 1, suspicious: 1, autoPublished: 0 });
    expect(mocks.opportunityCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: "SUSPICIOUS", moderationStatus: "PENDING",
      provenance: { create: expect.objectContaining({ adminOnlyJson: expect.objectContaining({
        potentialDuplicate: { matchedOpportunityId: "published-1", reason: "matching_published_event" },
      }) }) },
    }) });
  });

  it.each(["country", "format", "price"] as const)("keeps a new candidate with unknown %s in review", async (field) => {
    const incoming = { ...candidate(), [field]: undefined };
    const result = await ingestCandidates(connector, [incoming]);

    expect(result).toMatchObject({ created: 1, autoPublished: 0 });
    expect(mocks.opportunityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SUSPICIOUS",
        moderationStatus: "PENDING",
        country: field === "country" ? "Unspecified" : "Kazakhstan",
        shortDescription: expect.stringContaining(field),
        provenance: { create: expect.objectContaining({
          adminOnlyJson: expect.objectContaining({ ingestUnknownTerms: [field] }),
        }) },
      }),
    });
    expect(mocks.rawCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ processingState: "ingested", extracted: incoming }),
    });
  });

  it("does not replace known terms with placeholders when an unreviewed source loses details", async () => {
    mocks.opportunityFindFirst.mockResolvedValueOnce({
      id: "opp-1", sourceUrl: "https://t.me/official/102", sourceType: "telegram",
      status: "PENDING_REVIEW", moderationStatus: "PENDING", deletedAt: null,
    });
    const incoming = { ...candidate(), country: undefined, format: undefined, price: undefined };
    await ingestCandidates(connector, [incoming]);

    const update = mocks.opportunityUpdate.mock.calls[0][0].data;
    expect(update).not.toHaveProperty("country");
    expect(update).not.toHaveProperty("format");
    expect(update).not.toHaveProperty("price");
    expect(update.provenance.upsert.update.adminOnlyJson.ingestUnknownTerms).toEqual(["country", "format", "price"]);
  });

  it("clears unsupported application fields and attaches missing media to a pending post", async () => {
    mocks.opportunityFindFirst.mockResolvedValueOnce({
      id: "opp-1",
      sourceUrl: "https://t.me/official/102",
      sourceType: "telegram",
      status: "PENDING_REVIEW",
      moderationStatus: "PENDING",
      deletedAt: null,
    });

    const result = await ingestCandidates(connector, [candidate()]);

    expect(result.duplicate).toBe(1);
    expect(mocks.opportunityUpdate).toHaveBeenCalledWith({
      where: { id: "opp-1" },
      data: expect.objectContaining({
        lastCheckedAt: expect.any(Date),
        applicationUrl: null,
        applicationDeadline: null,
      }),
    });
    expect(mocks.mediaCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        opportunityId: "opp-1",
        platformMediaId: "photo-102",
        rightsState: "SOURCE_POST",
        rightsEvidenceRef: "https://t.me/official/102",
      })],
      skipDuplicates: true,
    });
    expect(mocks.mediaUpdateMany).toHaveBeenCalledWith({
      where: { opportunityId: "opp-1", platformMediaId: "photo-102", rightsState: "SOURCE_POST" },
      data: expect.objectContaining({
        url: "https://test.public.blob.vercel-storage.com/photo.jpg",
        rightsEvidenceRef: "https://t.me/official/102",
      }),
    });
  });

  it("promotes a refreshed current Telegram post with exact archive media into the active catalog", async () => {
    vi.stubEnv("AUTO_PUBLISH_PARSED_TELEGRAM", "true");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://extravity.vercel.app");
    mocks.opportunityFindFirst.mockResolvedValueOnce({
      id: "opp-1",
      sourceUrl: "https://t.me/official/102",
      sourceType: "telegram",
      status: "PENDING_REVIEW",
      moderationStatus: "PENDING",
      deletedAt: null,
      provenance: { adminOnlyJson: {} },
    });
    const checksum = "c".repeat(64);
    const incoming = candidateSchema.parse({
      ...candidate(false),
      applicationDeadline: "2030-01-15T23:59:59+05:00",
      applicationUrl: "https://apply.example.org/physics",
      sourcePublishedAt: new Date().toISOString(),
      media: [{
        kind: "IMAGE",
        url: `https://extravity.vercel.app/api/telegram-media/${checksum}`,
        storageKey: "telegram-archive:v1:-1001234567890:102:AQAD0123456789abcdefghij",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        position: 0,
        checksum,
        platformMediaId: "photo-102",
      }],
    });

    const result = await ingestCandidates(connector, [incoming]);

    expect(result).toMatchObject({ created: 0, duplicate: 1, autoPublished: 1 });
    expect(mocks.opportunityUpdate).toHaveBeenCalledWith({
      where: { id: "opp-1" },
      data: expect.objectContaining({
        status: "PUBLISHED",
        moderationStatus: "APPROVED",
        verifiedAt: null,
        provenance: { upsert: expect.objectContaining({
          update: { adminOnlyJson: expect.objectContaining({
            publicListingMode: "parsed_unverified",
            applicationDisabled: false,
            publicNotice: "Условия уточняйте у организатора.",
          }) },
        }) },
      }),
    });
    expect(mocks.mediaCreateMany).toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: "opportunity_published_as_parsed_unverified",
      entityId: "opp-1",
      meta: { source: "telegram", refreshedExisting: true },
    }) });
  });

  it("refreshes an unreviewed source title and description after an edit", async () => {
    mocks.opportunityFindFirst.mockResolvedValueOnce({
      id: "opp-1",
      sourceUrl: "https://t.me/official/102",
      sourceType: "telegram",
      status: "PENDING_REVIEW",
      moderationStatus: "PENDING",
      deletedAt: null,
    });
    const edited = candidateSchema.parse({
      ...candidate(false),
      title: "Олимпиада по физике Freedom Bank",
      shortDescription: "Обновлённые условия участия и дата регистрации",
      fullDescription: "Обновлённые условия участия и дата регистрации для школьников",
    });

    await ingestCandidates(connector, [edited]);

    expect(mocks.opportunityUpdate).toHaveBeenCalledWith({
      where: { id: "opp-1" },
      data: expect.objectContaining({
        title: "Олимпиада по физике Freedom Bank",
        shortDescription: "Обновлённые условия участия и дата регистрации",
        fullDescription: "Обновлённые условия участия и дата регистрации для школьников",
      }),
    });
  });

  it("does not replace reviewed fields or media on a published post", async () => {
    mocks.opportunityFindFirst.mockResolvedValueOnce({
      id: "opp-1",
      sourceUrl: "https://t.me/official/102",
      sourceType: "telegram",
      status: "PUBLISHED",
      moderationStatus: "APPROVED",
      deletedAt: null,
    });

    await ingestCandidates(connector, [candidate()]);

    expect(mocks.opportunityUpdate).toHaveBeenCalledWith({
      where: { id: "opp-1" },
      data: { lastCheckedAt: expect.any(Date) },
    });
    expect(mocks.mediaCreateMany).not.toHaveBeenCalled();
  });

  it("closes an approved active card when its own source reports an expired deadline", async () => {
    mocks.opportunityFindFirst.mockResolvedValueOnce({
      id: "opp-1",
      sourceUrl: "https://t.me/official/102",
      sourceType: "telegram",
      status: "REGISTRATION_OPEN",
      moderationStatus: "APPROVED",
      deletedAt: null,
    });
    const expired = candidateSchema.parse({
      ...candidate(false),
      applicationDeadline: "2020-01-01T23:59:00+05:00",
    });

    const result = await ingestCandidates(connector, [expired]);

    expect(result.duplicate).toBe(1);
    expect(mocks.opportunityUpdate).toHaveBeenCalledWith({
      where: { id: "opp-1" },
      data: {
        lastCheckedAt: expect.any(Date),
        applicationDeadline: new Date("2020-01-01T23:59:00+05:00"),
        status: "CLOSED",
      },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "opportunity_closed_by_source_deadline", entityId: "opp-1" }),
    });
    expect(mocks.mediaCreateMany).not.toHaveBeenCalled();
  });

  it("keeps fields that a reviewer has sent back for changes", async () => {
    mocks.opportunityFindFirst.mockResolvedValueOnce({
      id: "opp-1",
      sourceUrl: "https://t.me/official/102",
      sourceType: "telegram",
      status: "PENDING_REVIEW",
      moderationStatus: "NEEDS_CHANGES",
      deletedAt: null,
    });

    await ingestCandidates(connector, [candidate()]);

    expect(mocks.opportunityUpdate).toHaveBeenCalledWith({
      where: { id: "opp-1" },
      data: { lastCheckedAt: expect.any(Date) },
    });
    expect(mocks.mediaCreateMany).not.toHaveBeenCalled();
  });

  it("does not overwrite a similar listing from another source", async () => {
    mocks.opportunityFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "opp-other",
        sourceUrl: "https://example.org/olympiad",
        status: "PENDING_REVIEW",
        moderationStatus: "PENDING",
        deletedAt: null,
      });

    await ingestCandidates(connector, [candidate(false)]);

    expect(mocks.opportunityUpdate).not.toHaveBeenCalled();
    expect(mocks.mediaCreateMany).not.toHaveBeenCalled();
    expect(mocks.rawCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ processingState: "duplicate", opportunityId: "opp-other" }),
    });
  });

  it("keeps distinct opportunities that share an application portal", async () => {
    const sharedApplicationUrl = "https://apply.example.org/programs";
    mocks.opportunityFindFirst
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async ({ where }: { where: Record<string, unknown> }) =>
        JSON.stringify(where).includes('"applicationUrl"')
          ? { id: "different-program", sourceUrl: "https://example.org/other", deletedAt: null }
          : null);
    const secondProgram = candidateSchema.parse({
      ...candidate(false),
      title: "Новая олимпиада по химии",
      sourceUrl: "https://t.me/official/103",
      applicationUrl: sharedApplicationUrl,
      applicationDeadline: "2027-10-30T23:59:00+05:00",
    });

    const result = await ingestCandidates(connector, [secondProgram]);

    expect(result.created).toBe(1);
    expect(result.duplicate).toBe(0);
    expect(mocks.opportunityFindFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        title: "Новая олимпиада по химии",
        organizerName: "Official",
        categoryId: "category-1",
        applicationDeadline: new Date("2027-10-30T23:59:00+05:00"),
      }),
    }));
  });

  it("does not overwrite a pending organizer submission that shares the source URL", async () => {
    mocks.opportunityFindFirst.mockResolvedValueOnce({
      id: "organizer-opp",
      sourceUrl: "https://t.me/official/102",
      sourceType: "organizer_submission",
      status: "PENDING_REVIEW",
      moderationStatus: "PENDING",
      deletedAt: null,
    });

    await ingestCandidates(connector, [candidate()]);

    expect(mocks.opportunityUpdate).toHaveBeenCalledWith({
      where: { id: "organizer-opp" },
      data: { lastCheckedAt: expect.any(Date) },
    });
    expect(mocks.mediaCreateMany).not.toHaveBeenCalled();
  });

  it("records an expired new candidate without adding it to moderation", async () => {
    mocks.opportunityFindFirst.mockResolvedValue(null);
    const stale = candidateSchema.parse({
      ...candidate(false),
      applicationDeadline: "2020-01-01T23:59:00+05:00",
    });

    const result = await ingestCandidates(connector, [stale]);

    expect(result).toMatchObject({ created: 0, expired: 1, failed: 0 });
    expect(mocks.rawCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ processingState: "expired", error: "Application deadline passed" }),
    });
    expect(mocks.opportunityUpdate).not.toHaveBeenCalled();
  });
});
