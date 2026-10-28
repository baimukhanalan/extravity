import "server-only";
import { createHash, randomBytes } from "crypto";

export const TELEGRAM_LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

export function hashTelegramLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueTelegramLinkToken(now = new Date()): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = randomBytes(24).toString("hex");
  return {
    token,
    tokenHash: hashTelegramLinkToken(token),
    expiresAt: new Date(now.getTime() + TELEGRAM_LINK_TOKEN_TTL_MS),
  };
}

export function isTelegramLinkToken(value: string): boolean {
  return /^[a-f0-9]{48}$/.test(value);
}
