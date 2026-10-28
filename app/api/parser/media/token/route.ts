import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { safeEqual } from "@/lib/timing-safe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const MAX_DIRECT_VIDEO_BYTES = 64 * 1024 * 1024;

export function videoPathname(input: Record<string, unknown>): string | null {
  const account = input.sourceAccount;
  const post = input.sourcePostId;
  const media = input.platformMediaId;
  const checksum = input.checksum;
  if (typeof account !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(account)) return null;
  if (typeof post !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(post)) return null;
  if (typeof media !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(media)) return null;
  if (typeof checksum !== "string" || !/^[a-f0-9]{64}$/.test(checksum)) return null;
  return `opportunity-media/${account}/${post}/${media}-${checksum.slice(0, 12)}.mp4`;
}

export async function POST(req: NextRequest) {
  const secret = process.env.PARSER_INGEST_SECRET;
  const blobToken = process.env.MEDIA_BLOB_READ_WRITE_TOKEN;
  if (!secret || !blobToken) return NextResponse.json({ error: "Media storage not configured" }, { status: 503 });
  if (!safeEqual(req.headers.get("authorization") || "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = await rateLimit(`parser-media-token:${ip}`, 120, 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const pathname = videoPathname(input);
  const sizeBytes = input.sizeBytes;
  if (!pathname || typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 4 * 1024 * 1024 || sizeBytes > MAX_DIRECT_VIDEO_BYTES) {
    return NextResponse.json({ error: "Invalid video metadata" }, { status: 400 });
  }

  const token = await generateClientTokenFromReadWriteToken({
    token: blobToken,
    pathname,
    allowedContentTypes: ["video/mp4"],
    maximumSizeInBytes: sizeBytes,
    validUntil: Date.now() + 10 * 60 * 1000,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return NextResponse.json({ ok: true, token, pathname });
}
