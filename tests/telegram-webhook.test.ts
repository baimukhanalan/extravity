import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  transaction: vi.fn(),
  sendTelegram: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.findFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/notifications", () => ({ sendTelegram: mocks.sendTelegram }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { POST } from "@/app/api/telegram/webhook/route";
import { issueTelegramLinkToken } from "@/lib/telegram-link";

function startRequest(payload: string): Request {
  return new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: { chat: { id: 42 }, text: `/start ${payload}` } }),
  });
}

describe("Telegram webhook account linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockReset();
    mocks.transaction.mockReset();
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  it("does not accept a User.id as a link credential", async () => {
    const response = await POST(startRequest("3b167b35-5d12-44da-a95a-f39dbbba2510"));

    expect(response.status).toBe(200);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.sendTelegram).toHaveBeenCalledWith("42", expect.stringContaining("недействительна"));
  });

  it("links a valid, unexpired one-time credential", async () => {
    const issued = issueTelegramLinkToken();
    mocks.findFirst.mockResolvedValue({ id: "user-1", locale: "ru" });

    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const upsert = vi.fn().mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ user: { updateMany }, notificationPreference: { upsert } }),
    );

    const response = await POST(startRequest(issued.token));

    expect(response.status).toBe(200);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[0][0]).toMatchObject({
      where: { telegramChatId: "42", id: { not: "user-1" } },
      data: { telegramChatId: null },
    });
    expect(updateMany.mock.calls[1][0].where).toMatchObject({
      id: "user-1",
      telegramLinkTokenHash: issued.tokenHash,
    });
    expect(updateMany.mock.calls[1][0].data).toMatchObject({
      telegramChatId: "42",
      telegramLinkTokenHash: null,
    });
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("treats an already-consumed credential as invalid", async () => {
    const issued = issueTelegramLinkToken();
    mocks.findFirst.mockResolvedValue({ id: "user-1", locale: "ru" });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        user: {
          updateMany: vi
            .fn()
            .mockResolvedValueOnce({ count: 0 })
            .mockResolvedValueOnce({ count: 0 }),
        },
        notificationPreference: { upsert: vi.fn() },
      }),
    );

    const response = await POST(startRequest(issued.token));

    expect(response.status).toBe(200);
    expect(mocks.sendTelegram).toHaveBeenCalledWith("42", expect.stringContaining("недействительна"));
  });

  it("does not treat command prefixes as link or unlink commands", async () => {
    const response = await POST(new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: { chat: { id: 42 }, text: "/stopwatch" } }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.sendTelegram).toHaveBeenCalledWith("42", expect.stringContaining("Команды"));
  });

  it("requires an active, non-deleted account for forwarded content", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: { chat: { id: 42 }, text: "https://example.com/event" } }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { telegramChatId: "42", isActive: true, deletedAt: null },
    }));
    expect(mocks.sendTelegram).toHaveBeenCalledWith("42", expect.stringContaining("Сначала привяжите"));
  });
});
