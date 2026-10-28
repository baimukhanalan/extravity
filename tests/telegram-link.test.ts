import { describe, expect, it } from "vitest";
import {
  TELEGRAM_LINK_TOKEN_TTL_MS,
  hashTelegramLinkToken,
  isTelegramLinkToken,
  issueTelegramLinkToken,
} from "@/lib/telegram-link";

describe("Telegram account-link credentials", () => {
  it("issues a random, purpose-specific token with a fixed expiry", () => {
    const now = new Date("2026-09-10T00:00:00.000Z");
    const first = issueTelegramLinkToken(now);
    const second = issueTelegramLinkToken(now);

    expect(first.token).not.toBe(second.token);
    expect(isTelegramLinkToken(first.token)).toBe(true);
    expect(first.tokenHash).toBe(hashTelegramLinkToken(first.token));
    expect(first.tokenHash).not.toBe(first.token);
    expect(first.expiresAt.getTime()).toBe(now.getTime() + TELEGRAM_LINK_TOKEN_TTL_MS);
  });

  it("rejects UUIDs and malformed Telegram start payloads", () => {
    expect(isTelegramLinkToken("3b167b35-5d12-44da-a95a-f39dbbba2510")).toBe(false);
    expect(isTelegramLinkToken("A".repeat(48))).toBe(false);
    expect(isTelegramLinkToken("a".repeat(47))).toBe(false);
    expect(isTelegramLinkToken("a".repeat(49))).toBe(false);
  });
});
