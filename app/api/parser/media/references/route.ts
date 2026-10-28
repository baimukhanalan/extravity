import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeEqual } from "@/lib/timing-safe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REFERENCE_ROWS = 10_000;
const responseHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: Request) {
  const secret = process.env.PARSER_INGEST_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503, headers: responseHeaders });
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: responseHeaders });
  }
  const rows = await prisma.opportunityMedia.findMany({
    where: { storageKey: { startsWith: "railway-volume:" } },
    select: { storageKey: true },
    take: MAX_REFERENCE_ROWS + 1,
  });
  if (rows.length > MAX_REFERENCE_ROWS) {
    return NextResponse.json({ error: "Reference set exceeds safe response limit" }, { status: 503, headers: responseHeaders });
  }
  const assetIds = new Set<string>();
  for (const row of rows) {
    const id = row.storageKey?.slice("railway-volume:".length);
    if (!id || !/^[a-f0-9]{64}$/.test(id)) {
      return NextResponse.json({ error: "Invalid stored media reference" }, { status: 503, headers: responseHeaders });
    }
    assetIds.add(id);
  }
  return NextResponse.json({ ok: true, assetIds: [...assetIds].sort() }, { headers: responseHeaders });
}
