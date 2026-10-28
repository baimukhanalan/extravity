import { NextResponse } from "next/server";
import { fetchTelegramArchiveMedia } from "@/lib/telegram-media-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const baseHeaders = {
  "Cache-Control": "public, max-age=3600, s-maxage=31536000, immutable",
  "Content-Security-Policy": "default-src 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

async function handle(context: { params: Promise<{ assetId: string }> }, head: boolean) {
  const { assetId } = await context.params;
  const media = await fetchTelegramArchiveMedia(assetId);
  if (!media) return NextResponse.json({ error: "Media unavailable" }, {
    status: 404,
    headers: { ...baseHeaders, "Cache-Control": "private, no-store, max-age=0" },
  });
  const headers = { ...baseHeaders, "Content-Type": media.mimeType, "Content-Length": String(media.bytes.byteLength) };
  return new NextResponse(head ? null : media.bytes, { status: 200, headers });
}

export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  return handle(context, false);
}

export async function HEAD(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  return handle(context, true);
}
