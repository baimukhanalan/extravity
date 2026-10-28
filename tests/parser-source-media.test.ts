import { afterEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { candidateSchema } from "@/lib/ingest-rules";
import {
  assetIdForChecksum,
  isAllowedParserMedia,
  isTrustedAppMediaUrl,
  parserMediaCapability,
  signedRailwayMediaUrl,
} from "@/lib/parser-source-media";
import { railwayMediaDisplayUrl } from "@/lib/railway-media-display";

const appUrl = "https://extracurriculars-kz.vercel.app";
const mediaOrigin = "https://parser-production-51bc.up.railway.app";
const secret = "test-parser-ingest-secret";
const checksum = "a".repeat(64);
const assetId = checksum;

const old = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  PARSER_MEDIA_ORIGIN: process.env.PARSER_MEDIA_ORIGIN,
  PARSER_INGEST_SECRET: process.env.PARSER_INGEST_SECRET,
  MEDIA_BLOB_READ_WRITE_TOKEN: process.env.MEDIA_BLOB_READ_WRITE_TOKEN,
  RAILWAY_MEDIA_ENABLED: process.env.RAILWAY_MEDIA_ENABLED,
  TELEGRAM_MEDIA_ARCHIVE_ENABLED: process.env.TELEGRAM_MEDIA_ARCHIVE_ENABLED,
  TELEGRAM_MEDIA_BOT_TOKEN: process.env.TELEGRAM_MEDIA_BOT_TOKEN,
  TELEGRAM_MEDIA_ARCHIVE_CHAT_ID: process.env.TELEGRAM_MEDIA_ARCHIVE_CHAT_ID,
};

afterEach(() => {
  for (const [key, value] of Object.entries(old)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function railwayMedia(overrides: Partial<{ url: string; storageKey: string; checksum: string }> = {}) {
  return {
    url: `${appUrl}/api/source-media/${assetId}`,
    storageKey: `railway-volume:${assetId}`,
    checksum,
    ...overrides,
  };
}

describe("parser source media", () => {
  it("accepts only the signed-content asset on the exact app origin and path", () => {
    process.env.NEXT_PUBLIC_APP_URL = appUrl;
    process.env.PARSER_INGEST_SECRET = secret;
    const base = railwayMedia();
    expect(assetIdForChecksum(checksum)).toBe(assetId);
    expect(isAllowedParserMedia(base)).toBe(true);
    expect(railwayMediaDisplayUrl(base)).toBe(`/api/source-media/${assetId}`);
    expect(railwayMediaDisplayUrl(base, true)).toBe(`/api/admin/source-media/${assetId}`);
    for (const invalid of [
      { url: `http://extracurriculars-kz.vercel.app/api/source-media/${assetId}` },
      { url: `https://extracurriculars-kz.vercel.app.evil.test/api/source-media/${assetId}` },
      { url: `${appUrl}/api/source-media/${assetId}?x=1` },
      { url: `${appUrl}/api/source-media/${assetId}/extra` },
      { storageKey: `railway-volume:${"b".repeat(64)}` },
      { checksum: "b".repeat(64) },
    ]) {
      expect(isAllowedParserMedia(railwayMedia(invalid))).toBe(false);
    }
    expect(isAllowedParserMedia({ url: "https://test.public.blob.vercel-storage.com/a.jpg", checksum })).toBe(true);
  });

  it("keeps media from the previous Vercel alias readable after the Extravity rename", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://extravity.vercel.app";
    expect(isTrustedAppMediaUrl(
      `https://extracurriculars-kz.vercel.app/api/telegram-media/${assetId}`,
      `/api/telegram-media/${assetId}`,
    )).toBe(true);
    expect(isTrustedAppMediaUrl(
      `https://extracurriculars-kz.vercel.app.evil.test/api/telegram-media/${assetId}`,
      `/api/telegram-media/${assetId}`,
    )).toBe(false);
    expect(isTrustedAppMediaUrl(
      `https://extracurriculars-kz.vercel.app/api/telegram-media/${assetId}?download=1`,
      `/api/telegram-media/${assetId}`,
    )).toBe(false);

    process.env.NEXT_PUBLIC_APP_URL = "https://another-app.example";
    expect(isTrustedAppMediaUrl(
      `https://extracurriculars-kz.vercel.app/api/telegram-media/${assetId}`,
      `/api/telegram-media/${assetId}`,
    )).toBe(false);
  });

  it("rejects a Railway candidate through the actual ingest schema if its proof is wrong", () => {
    process.env.NEXT_PUBLIC_APP_URL = appUrl;
    process.env.PARSER_INGEST_SECRET = secret;
    const base = {
      title: "Школьный конкурс исследовательских работ",
      shortDescription: "Набор участников 8–11 классов",
      categorySlug: "olympiad",
      organizerName: "Организатор",
      sourceUrl: "https://t.me/official/123",
      media: [{
        kind: "IMAGE", mimeType: "image/jpeg", sizeBytes: 1000, position: 0,
        platformMediaId: "photo-123", ...railwayMedia(),
      }],
    };
    expect(candidateSchema.safeParse(base).success).toBe(true);
    expect(candidateSchema.safeParse({ ...base, media: [{ ...base.media[0], checksum: "b".repeat(64) }] }).success).toBe(false);
  });

  it("issues a short HMAC grant with clock-skew headroom only for a configured HTTPS origin", () => {
    process.env.PARSER_MEDIA_ORIGIN = mediaOrigin;
    process.env.PARSER_INGEST_SECRET = secret;
    const now = Date.UTC(2026, 8, 29, 12, 0, 0);
    const target = signedRailwayMediaUrl(assetId, now);
    expect(target?.origin).toBe(mediaOrigin);
    expect(target?.pathname).toBe(`/source-media/${assetId}`);
    expect(target?.searchParams.get("expires")).toBe(String(now / 1000 + 45));
    expect(target?.searchParams.get("sig")).toBe(createHmac("sha256", secret).update(`${assetId}:${now / 1000 + 45}`).digest("hex"));
    process.env.PARSER_MEDIA_ORIGIN = "http://parser-production-51bc.up.railway.app";
    expect(signedRailwayMediaUrl(assetId, now)).toBeNull();
    process.env.PARSER_MEDIA_ORIGIN = appUrl;
    process.env.NEXT_PUBLIC_APP_URL = appUrl;
    expect(signedRailwayMediaUrl(assetId, now)).toBeNull();
  });

  it("reports Railway readiness only with a valid app origin, media origin and shared secret", () => {
    process.env.NEXT_PUBLIC_APP_URL = appUrl;
    process.env.PARSER_MEDIA_ORIGIN = mediaOrigin;
    process.env.PARSER_INGEST_SECRET = secret;
    delete process.env.MEDIA_BLOB_READ_WRITE_TOKEN;
    delete process.env.RAILWAY_MEDIA_ENABLED;
    expect(parserMediaCapability()).toEqual({ mediaConfigured: false, mediaBackend: "none" });
    process.env.RAILWAY_MEDIA_ENABLED = "true";
    expect(parserMediaCapability()).toEqual({ mediaConfigured: true, mediaBackend: "railway_volume" });
    process.env.PARSER_MEDIA_ORIGIN = "http://parser-production-51bc.up.railway.app";
    expect(parserMediaCapability()).toEqual({ mediaConfigured: false, mediaBackend: "none" });
    process.env.MEDIA_BLOB_READ_WRITE_TOKEN = "test-blob-token";
    expect(parserMediaCapability()).toEqual({ mediaConfigured: true, mediaBackend: "vercel_blob" });
  });

  it("accepts a checksum-bound Telegram archive proxy and reports the backend only when fully configured", () => {
    process.env.NEXT_PUBLIC_APP_URL = appUrl;
    delete process.env.MEDIA_BLOB_READ_WRITE_TOKEN;
    delete process.env.RAILWAY_MEDIA_ENABLED;
    const archived = {
      url: `${appUrl}/api/telegram-media/${assetId}`,
      storageKey: `telegram-archive:v1:-1001234567890:42:${"A".repeat(40)}`,
      checksum,
    };
    expect(isAllowedParserMedia(archived)).toBe(true);
    expect(isAllowedParserMedia({ ...archived, url: `${appUrl}/api/telegram-media/${"b".repeat(64)}` })).toBe(false);
    expect(isAllowedParserMedia({ ...archived, storageKey: "telegram-archive:v1:-100:42:short" })).toBe(false);
    process.env.TELEGRAM_MEDIA_ARCHIVE_ENABLED = "true";
    process.env.TELEGRAM_MEDIA_BOT_TOKEN = `123456:${"A".repeat(35)}`;
    process.env.TELEGRAM_MEDIA_ARCHIVE_CHAT_ID = "-1001234567890";
    expect(parserMediaCapability()).toEqual({ mediaConfigured: true, mediaBackend: "telegram_archive" });
  });
});
