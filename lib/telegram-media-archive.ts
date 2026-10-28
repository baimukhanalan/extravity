import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { assetIdForChecksum, isTrustedAppMediaUrl } from "./parser-source-media";
import { isOriginalTelegramPostMedia, publicSourceMediaWhere } from "./source-media-provenance";

const STORAGE_KEY = /^telegram-archive:v1:(-?[1-9][0-9]*):([1-9][0-9]*):([A-Za-z0-9_-]{20,300})$/;
const TOKEN = /^[1-9][0-9]{4,14}:[A-Za-z0-9_-]{30,}$/;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4"]);

export type TelegramArchiveReference = {
  chatId: string;
  messageId: string;
  fileId: string;
};

export function parseTelegramArchiveStorageKey(value: string | null | undefined): TelegramArchiveReference | null {
  const match = STORAGE_KEY.exec(value ?? "");
  return match ? { chatId: match[1], messageId: match[2], fileId: match[3] } : null;
}

async function findMedia(assetId: string, preview: boolean) {
  if (!assetIdForChecksum(assetId)) return null;
  const media = await prisma.opportunityMedia.findFirst({
    where: {
      ...(preview ? { processingState: "READY" as const, rightsState: { not: "REJECTED" as const } } : publicSourceMediaWhere),
      checksum: assetId,
      storageKey: { startsWith: "telegram-archive:v1:" },
      opportunity: {
        is: preview
          ? { deletedAt: null, provenance: { is: { accessScope: "PUBLIC" } } }
          : {
              deletedAt: null,
              status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON", "SUSPICIOUS", "CLOSED", "COMPLETED"] },
              moderationStatus: "APPROVED",
              provenance: { is: { accessScope: "PUBLIC" } },
            },
      },
    },
    select: {
      checksum: true,
      url: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      platformMediaId: true,
      processingState: true,
      rightsState: true,
      rightsEvidenceRef: true,
      opportunity: { select: { sourceType: true, sourceUrl: true } },
    },
  });
  if (!media || media.checksum !== assetId || !ALLOWED_MIME.has(media.mimeType)) return null;
  if (!preview && (!['telegram', 'telegram_forward'].includes(media.opportunity.sourceType)
    || !isOriginalTelegramPostMedia(media.opportunity.sourceUrl, media))) return null;
  if (!isTrustedAppMediaUrl(media.url, `/api/telegram-media/${assetId}`)) return null;
  const reference = parseTelegramArchiveStorageKey(media.storageKey);
  if (!reference || reference.chatId !== process.env.TELEGRAM_MEDIA_ARCHIVE_CHAT_ID) return null;
  return { ...media, reference };
}

export async function fetchTelegramArchiveMedia(assetId: string, preview = false): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  const token = process.env.TELEGRAM_MEDIA_BOT_TOKEN ?? "";
  if (!TOKEN.test(token)) return null;
  const media = await findMedia(assetId, preview);
  if (!media || media.sizeBytes <= 0 || media.sizeBytes > MAX_DOWNLOAD_BYTES) return null;
  try {
    const metadataResponse = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: media.reference.fileId }),
      cache: "no-store",
    });
    if (!metadataResponse.ok) return null;
    const metadata = await metadataResponse.json() as { ok?: boolean; result?: { file_path?: string; file_size?: number } };
    const filePath = metadata.ok ? metadata.result?.file_path : undefined;
    const fileSize = metadata.result?.file_size;
    if (!filePath || filePath.includes("..") || filePath.startsWith("/")
      || (fileSize !== undefined && (fileSize !== media.sizeBytes || fileSize > MAX_DOWNLOAD_BYTES))) return null;
    const fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, { cache: "no-store" });
    if (!fileResponse.ok) return null;
    const buffer = await fileResponse.arrayBuffer();
    if (buffer.byteLength !== media.sizeBytes || buffer.byteLength > MAX_DOWNLOAD_BYTES) return null;
    if (createHash("sha256").update(new Uint8Array(buffer)).digest("hex") !== assetId) return null;
    return { bytes: buffer, mimeType: media.mimeType };
  } catch {
    return null;
  }
}
