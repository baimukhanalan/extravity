import { createHash } from "node:crypto";
import { BlobStoreSuspendedError, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { safeEqual } from "@/lib/timing-safe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;
const TELEGRAM_TOKEN = /^[1-9][0-9]{4,14}:[A-Za-z0-9_-]{30,}$/;
const TELEGRAM_CHAT = /^-?[1-9][0-9]*$/;
const TELEGRAM_FILE_ID = /^[A-Za-z0-9_-]{20,300}$/;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
};

// Parser retries intentionally reuse a content-addressed pathname. A previous
// media upload may have succeeded even when the following candidate ingest did
// not, so the same retry must be able to put the identical object again.
export const MEDIA_BLOB_RETRY_OPTIONS = {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
} as const;

function validMagic(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (mime === "image/webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (mime === "video/mp4") return new TextDecoder().decode(bytes.slice(4, 12)).includes("ftyp");
  return false;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "unknown";
}

export async function POST(req: NextRequest) {
  const secret = process.env.PARSER_INGEST_SECRET;
  if (!secret) return NextResponse.json({ error: "Media ingest not configured" }, { status: 503 });
  if (!safeEqual(req.headers.get("authorization") || "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = await rateLimit(`parser-media:${ip}`, 120, 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "File required" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "Invalid file size" }, { status: 413 });
  const extension = MIME_EXTENSIONS[file.type];
  if (!extension) return NextResponse.json({ error: "Unsupported media type" }, { status: 415 });

  const sourceAccount = safeSegment(String(form.get("sourceAccount") || "telegram"));
  const sourcePostId = safeSegment(String(form.get("sourcePostId") || "post"));
  const platformMediaId = safeSegment(String(form.get("platformMediaId") || crypto.randomUUID()));
  const position = Math.max(0, Math.min(9, Number(form.get("position") || 0) || 0));
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!validMagic(bytes, file.type)) return NextResponse.json({ error: "Media signature mismatch" }, { status: 415 });
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const telegramToken = process.env.TELEGRAM_MEDIA_BOT_TOKEN ?? "";
  const telegramChatId = process.env.TELEGRAM_MEDIA_ARCHIVE_CHAT_ID ?? "";
  const telegramArchiveEnabled = process.env.TELEGRAM_MEDIA_ARCHIVE_ENABLED === "true"
    && TELEGRAM_TOKEN.test(telegramToken)
    && TELEGRAM_CHAT.test(telegramChatId);

  if (telegramArchiveEnabled) {
    const field = file.type === "video/mp4" ? "video" : "document";
    const method = file.type === "video/mp4" ? "sendVideo" : "sendDocument";
    const telegramForm = new FormData();
    telegramForm.set("chat_id", telegramChatId);
    telegramForm.set("caption", `source=${sourceAccount}/${sourcePostId} media=${platformMediaId} sha256=${checksum}`);
    telegramForm.set("disable_notification", "true");
    telegramForm.set(field, new Blob([buffer], { type: file.type }), `${checksum}.${extension}`);
    try {
      const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramToken}/${method}`, {
        method: "POST",
        body: telegramForm,
        cache: "no-store",
      });
      const telegramBody = await telegramResponse.json() as {
        ok?: boolean;
        result?: { message_id?: number; document?: { file_id?: string }; video?: { file_id?: string } };
      };
      const messageId = telegramBody.result?.message_id;
      const fileId = field === "video" ? telegramBody.result?.video?.file_id : telegramBody.result?.document?.file_id;
      if (!telegramResponse.ok || telegramBody.ok !== true || !Number.isInteger(messageId) || Number(messageId) <= 0
        || !fileId || !TELEGRAM_FILE_ID.test(fileId)) {
        return NextResponse.json({ error: "Telegram media archive unavailable" }, { status: 503 });
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      return NextResponse.json({
        ok: true,
        media: {
          kind: file.type.startsWith("video/") ? "VIDEO" : "IMAGE",
          url: new URL(`/api/telegram-media/${checksum}`, appUrl).toString(),
          storageKey: `telegram-archive:v1:${telegramChatId}:${messageId}:${fileId}`,
          mimeType: file.type,
          sizeBytes: file.size,
          position,
          checksum,
          platformMediaId,
        },
      });
    } catch {
      return NextResponse.json({ error: "Telegram media archive unavailable" }, { status: 503 });
    }
  }

  if (!process.env.MEDIA_BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Blob storage not configured" }, { status: 503 });
  const pathname = `opportunity-media/${sourceAccount}/${sourcePostId}/${platformMediaId}-${checksum.slice(0, 12)}.${extension}`;
  let blob;
  try {
    blob = await put(pathname, buffer, {
      ...MEDIA_BLOB_RETRY_OPTIONS,
      contentType: file.type,
      token: process.env.MEDIA_BLOB_READ_WRITE_TOKEN,
    });
  } catch (error) {
    if (error instanceof BlobStoreSuspendedError) {
      return NextResponse.json({ error: "Media storage suspended" }, { status: 503 });
    }
    throw error;
  }

  return NextResponse.json({
    ok: true,
    media: {
      kind: file.type.startsWith("video/") ? "VIDEO" : "IMAGE",
      url: blob.url,
      storageKey: blob.pathname,
      mimeType: file.type,
      sizeBytes: file.size,
      position,
      checksum,
      platformMediaId,
    },
  });
}
