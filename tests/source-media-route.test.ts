import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mediaFindFirst: vi.fn(), currentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { opportunityMedia: { findFirst: mocks.mediaFindFirst } } }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.currentUser,
  isStaff: (role: string) => ["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(role),
}));

import { GET, HEAD } from "@/app/api/source-media/[assetId]/route";
import { GET as ADMIN_GET } from "@/app/api/admin/source-media/[assetId]/route";

const checksum = "b".repeat(64);
const secret = "test-parser-ingest-secret";
const assetId = checksum;
const appUrl = "https://extracurriculars-kz.vercel.app";
const approvedMedia = {
  checksum,
  url: `${appUrl}/api/source-media/${assetId}`,
  storageKey: `railway-volume:${assetId}`,
  platformMediaId: "tg-photo-42",
  processingState: "READY",
  rightsState: "SOURCE_POST",
  rightsEvidenceRef: "https://t.me/example/42",
  opportunity: { sourceType: "telegram", sourceUrl: "https://t.me/example/42" },
};

const old = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  PARSER_MEDIA_ORIGIN: process.env.PARSER_MEDIA_ORIGIN,
  PARSER_INGEST_SECRET: process.env.PARSER_INGEST_SECRET,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = appUrl;
  process.env.PARSER_MEDIA_ORIGIN = "https://media.up.railway.app";
  process.env.PARSER_INGEST_SECRET = secret;
});

afterEach(() => {
  for (const [key, value] of Object.entries(old)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const context = (id = assetId) => ({ params: Promise.resolve({ assetId: id }) });

describe("public source-media redirect", () => {
  it("redirects an approved public source with no-store and checks the exact media row", async () => {
    mocks.mediaFindFirst.mockResolvedValue(approvedMedia);
    const response = await GET(new Request(`${appUrl}/api/source-media/${assetId}`), context());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toMatch(/^https:\/\/media\.up\.railway\.app\/source-media\/[a-f0-9]{64}\?expires=\d+&sig=[a-f0-9]{64}$/);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.mediaFindFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        storageKey: `railway-volume:${assetId}`,
        processingState: "READY",
        rightsState: "SOURCE_POST",
        opportunity: {
          is: expect.objectContaining({
            deletedAt: null,
            moderationStatus: "APPROVED",
            provenance: { is: { accessScope: "PUBLIC" } },
          }),
        },
      }),
      select: expect.objectContaining({ checksum: true, url: true, opportunity: { select: { sourceType: true, sourceUrl: true } } }),
    });
    const head = await HEAD(new Request(`${appUrl}/api/source-media/${assetId}`, { method: "HEAD" }), context());
    expect(head.status).toBe(307);
  });

  it("returns 404 for unknown, malformed, or checksum-mismatched assets", async () => {
    mocks.mediaFindFirst.mockResolvedValue(null);
    expect((await GET(new Request(`${appUrl}/api/source-media/${assetId}`), context())).status).toBe(404);
    expect((await GET(new Request(`${appUrl}/api/source-media/invalid`), context("invalid"))).status).toBe(404);
    mocks.mediaFindFirst.mockResolvedValue({ ...approvedMedia, checksum: "a".repeat(64) });
    expect((await GET(new Request(`${appUrl}/api/source-media/${assetId}`), context())).status).toBe(404);
  });

  it("lets only staff preview a pending public-source media row without changing public access", async () => {
    mocks.mediaFindFirst.mockResolvedValue(approvedMedia);
    mocks.currentUser.mockResolvedValue(null);
    expect((await ADMIN_GET(new Request(`${appUrl}/api/admin/source-media/${assetId}`), context())).status).toBe(404);
    expect(mocks.mediaFindFirst).not.toHaveBeenCalled();
    mocks.currentUser.mockResolvedValue({ role: "STUDENT" });
    expect((await ADMIN_GET(new Request(`${appUrl}/api/admin/source-media/${assetId}`), context())).status).toBe(404);
    expect(mocks.mediaFindFirst).not.toHaveBeenCalled();
    mocks.currentUser.mockResolvedValue({ role: "MODERATOR" });
    const response = await ADMIN_GET(new Request(`${appUrl}/api/admin/source-media/${assetId}`), context());
    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.mediaFindFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        storageKey: `railway-volume:${assetId}`,
        processingState: "READY",
        rightsState: { not: "REJECTED" },
        opportunity: { is: { deletedAt: null, provenance: { is: { accessScope: "PUBLIC" } } } },
      }),
      select: expect.objectContaining({ checksum: true, url: true, opportunity: { select: { sourceType: true, sourceUrl: true } } }),
    });
  });

  it("does not serve a media file tied to another Telegram post", async () => {
    mocks.mediaFindFirst.mockResolvedValue({ ...approvedMedia, rightsEvidenceRef: "https://t.me/example/43" });
    expect((await GET(new Request(`${appUrl}/api/source-media/${assetId}`), context())).status).toBe(404);
    mocks.mediaFindFirst.mockResolvedValue({ ...approvedMedia, opportunity: { sourceType: "official_site", sourceUrl: "https://example.org" } });
    expect((await GET(new Request(`${appUrl}/api/source-media/${assetId}`), context())).status).toBe(404);
  });
});
