import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mediaFindMany: vi.fn(),
  mediaUpdateMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { opportunityMedia: { findMany: mocks.mediaFindMany, updateMany: mocks.mediaUpdateMany } },
}));

import { cleanupUnusedTelegramArchiveMedia } from "@/lib/telegram-media-retention";

const token = `123456:${"A".repeat(35)}`;
const chatId = "-1001234567890";
const fileId = "B".repeat(40);
const key = `telegram-archive:v1:${chatId}:42:${fileId}`;
const oldFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELEGRAM_MEDIA_BOT_TOKEN = token;
  process.env.TELEGRAM_MEDIA_ARCHIVE_CHAT_ID = chatId;
  mocks.mediaUpdateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  global.fetch = oldFetch;
  delete process.env.TELEGRAM_MEDIA_BOT_TOKEN;
  delete process.env.TELEGRAM_MEDIA_ARCHIVE_CHAT_ID;
});

describe("Telegram archive retention", () => {
  it("deletes an owned archive message only when no live opportunity references it", async () => {
    mocks.mediaFindMany.mockResolvedValueOnce([{ storageKey: key }]).mockResolvedValueOnce([]);
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }));

    await expect(cleanupUnusedTelegramArchiveMedia()).resolves.toEqual({ candidates: 1, deleted: 1, failed: 0, skipped: 0 });
    expect(mocks.mediaFindMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        processingState: "READY",
        opportunity: { is: { OR: [{ status: "ARCHIVED" }, { deletedAt: { not: null } }] } },
      }),
    }));
    expect(mocks.mediaFindMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        opportunity: { is: { deletedAt: null, status: { not: "ARCHIVED" } } },
      }),
    }));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/deleteMessage"), expect.objectContaining({
      body: JSON.stringify({ chat_id: chatId, message_id: 42 }),
    }));
    expect(mocks.mediaUpdateMany).toHaveBeenCalledWith({ where: { storageKey: key }, data: { processingState: "FAILED" } });
  });

  it("retains shared media while any active opportunity references it", async () => {
    mocks.mediaFindMany.mockResolvedValueOnce([{ storageKey: key }]).mockResolvedValueOnce([{ storageKey: key }]);
    global.fetch = vi.fn();

    await expect(cleanupUnusedTelegramArchiveMedia()).resolves.toEqual({ candidates: 1, deleted: 0, failed: 0, skipped: 1 });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mocks.mediaUpdateMany).not.toHaveBeenCalled();
  });

  it("never deletes from a chat other than the configured Extravity archive", async () => {
    const foreignKey = `telegram-archive:v1:-1009999999999:42:${fileId}`;
    mocks.mediaFindMany.mockResolvedValueOnce([{ storageKey: foreignKey }]).mockResolvedValueOnce([]);
    global.fetch = vi.fn();

    await expect(cleanupUnusedTelegramArchiveMedia()).resolves.toEqual({ candidates: 1, deleted: 0, failed: 0, skipped: 1 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not inspect or mutate media when archive credentials are absent", async () => {
    delete process.env.TELEGRAM_MEDIA_BOT_TOKEN;
    delete process.env.TELEGRAM_MEDIA_ARCHIVE_CHAT_ID;
    global.fetch = vi.fn();

    await expect(cleanupUnusedTelegramArchiveMedia()).resolves.toEqual({ candidates: 0, deleted: 0, failed: 0, skipped: 0 });
    expect(mocks.mediaFindMany).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
