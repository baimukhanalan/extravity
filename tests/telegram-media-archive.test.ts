import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({ mediaFindFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { opportunityMedia: { findFirst: mocks.mediaFindFirst } } }));

import { fetchTelegramArchiveMedia, parseTelegramArchiveStorageKey } from "@/lib/telegram-media-archive";

const bytes = new TextEncoder().encode("exact telegram source media");
const checksum = createHash("sha256").update(bytes).digest("hex");
const appUrl = "https://extravity.vercel.app";
const legacyAppUrl = "https://extracurriculars-kz.vercel.app";
const token = `123456:${"A".repeat(35)}`;
const chatId = "-1001234567890";
const fileId = "B".repeat(40);
const originalFetch = global.fetch;
const old = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  TELEGRAM_MEDIA_BOT_TOKEN: process.env.TELEGRAM_MEDIA_BOT_TOKEN,
  TELEGRAM_MEDIA_ARCHIVE_CHAT_ID: process.env.TELEGRAM_MEDIA_ARCHIVE_CHAT_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = appUrl;
  process.env.TELEGRAM_MEDIA_BOT_TOKEN = token;
  process.env.TELEGRAM_MEDIA_ARCHIVE_CHAT_ID = chatId;
  mocks.mediaFindFirst.mockResolvedValue({
    checksum,
    url: `${appUrl}/api/telegram-media/${checksum}`,
    storageKey: `telegram-archive:v1:${chatId}:42:${fileId}`,
    mimeType: "image/jpeg",
    sizeBytes: bytes.byteLength,
    platformMediaId: "source-photo-1",
    processingState: "READY",
    rightsState: "SOURCE_POST",
    rightsEvidenceRef: "https://t.me/example/42",
    opportunity: { sourceType: "telegram", sourceUrl: "https://t.me/example/42" },
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  for (const [key, value] of Object.entries(old)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Telegram media archive", () => {
  it("parses only bounded archive references", () => {
    expect(parseTelegramArchiveStorageKey(`telegram-archive:v1:${chatId}:42:${fileId}`)).toEqual({ chatId, messageId: "42", fileId });
    expect(parseTelegramArchiveStorageKey("telegram-archive:v1:-100:0:bad")).toBeNull();
  });

  it("downloads through Bot API and verifies exact size and checksum", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { file_path: "photos/file.jpg", file_size: bytes.byteLength } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(bytes, { status: 200 }));
    const result = await fetchTelegramArchiveMedia(checksum);
    expect(result?.mimeType).toBe("image/jpeg");
    expect(new Uint8Array(result!.bytes)).toEqual(bytes);
    expect(String(vi.mocked(global.fetch).mock.calls[0][0])).not.toContain(fileId);
  });

  it("downloads checksum-bound media saved under the previous Vercel alias", async () => {
    mocks.mediaFindFirst.mockResolvedValue({
      ...(await mocks.mediaFindFirst()),
      url: `${legacyAppUrl}/api/telegram-media/${checksum}`,
    });
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { file_path: "photos/file.jpg", file_size: bytes.byteLength } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(bytes, { status: 200 }));
    await expect(fetchTelegramArchiveMedia(checksum)).resolves.toEqual({
      bytes: bytes.buffer,
      mimeType: "image/jpeg",
    });
  });

  it("fails closed for another chat, changed bytes, or an unpublished row", async () => {
    mocks.mediaFindFirst.mockResolvedValueOnce({
      ...(await mocks.mediaFindFirst()),
      storageKey: `telegram-archive:v1:-1009999999999:42:${fileId}`,
    });
    await expect(fetchTelegramArchiveMedia(checksum)).resolves.toBeNull();
    mocks.mediaFindFirst.mockResolvedValue({
      checksum,
      url: `${appUrl}/api/telegram-media/${checksum}`,
      storageKey: `telegram-archive:v1:${chatId}:42:${fileId}`,
      mimeType: "image/jpeg",
      sizeBytes: bytes.byteLength,
      platformMediaId: "source-photo-1",
      processingState: "READY",
      rightsState: "SOURCE_POST",
      rightsEvidenceRef: "https://t.me/example/42",
      opportunity: { sourceType: "telegram", sourceUrl: "https://t.me/example/42" },
    });
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { file_path: "photos/file.jpg", file_size: bytes.byteLength } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new TextEncoder().encode("changed telegram source media"), { status: 200 }));
    await expect(fetchTelegramArchiveMedia(checksum)).resolves.toBeNull();
  });
});
