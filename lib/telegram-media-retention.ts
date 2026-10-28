import "server-only";
import { prisma } from "./prisma";
import { parseTelegramArchiveStorageKey } from "./telegram-media-archive";

const TOKEN = /^[1-9][0-9]{4,14}:[A-Za-z0-9_-]{30,}$/;
const MAX_CLEANUP_BATCH = 500;

type CleanupResult = {
  candidates: number;
  deleted: number;
  failed: number;
  skipped: number;
};

export async function cleanupUnusedTelegramArchiveMedia(): Promise<CleanupResult> {
  const token = process.env.TELEGRAM_MEDIA_BOT_TOKEN ?? "";
  const archiveChatId = process.env.TELEGRAM_MEDIA_ARCHIVE_CHAT_ID ?? "";
  if (!TOKEN.test(token) || !/^-?[1-9][0-9]*$/.test(archiveChatId)) {
    return { candidates: 0, deleted: 0, failed: 0, skipped: 0 };
  }

  const terminalRows = await prisma.opportunityMedia.findMany({
    where: {
      storageKey: { startsWith: "telegram-archive:v1:" },
      processingState: "READY",
      opportunity: { is: { OR: [{ status: "ARCHIVED" }, { deletedAt: { not: null } }] } },
    },
    select: { storageKey: true },
    distinct: ["storageKey"],
    take: MAX_CLEANUP_BATCH,
  });
  const candidates = terminalRows
    .map((row) => row.storageKey)
    .filter((key): key is string => Boolean(key));
  if (candidates.length === 0) return { candidates: 0, deleted: 0, failed: 0, skipped: 0 };

  const liveReferences = await prisma.opportunityMedia.findMany({
    where: {
      storageKey: { in: candidates },
      opportunity: { is: { deletedAt: null, status: { not: "ARCHIVED" } } },
    },
    select: { storageKey: true },
    distinct: ["storageKey"],
  });
  const retained = new Set(liveReferences.map((row) => row.storageKey).filter(Boolean));

  let deleted = 0;
  let failed = 0;
  let skipped = 0;
  for (const storageKey of candidates) {
    if (retained.has(storageKey)) {
      skipped++;
      continue;
    }
    const reference = parseTelegramArchiveStorageKey(storageKey);
    if (!reference || reference.chatId !== archiveChatId) {
      skipped++;
      continue;
    }
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: reference.chatId, message_id: Number(reference.messageId) }),
        cache: "no-store",
      });
      const body = response.ok ? await response.json() as { ok?: boolean; result?: boolean } : null;
      if (!body?.ok || body.result !== true) {
        failed++;
        continue;
      }
      await prisma.opportunityMedia.updateMany({
        where: { storageKey },
        data: { processingState: "FAILED" },
      });
      deleted++;
    } catch {
      failed++;
    }
  }
  return { candidates: candidates.length, deleted, failed, skipped };
}
