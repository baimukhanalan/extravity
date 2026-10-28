import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { safeEqual } from "@/lib/timing-safe";

export const dynamic = "force-dynamic";

const publicPost = z.string().regex(/^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\/[1-9]\d*$/);
const responseHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function authorized(request: NextRequest): boolean {
  const secret = process.env.PARSER_INGEST_SECRET;
  return Boolean(secret && safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`));
}

export async function GET(request: NextRequest) {
  if (!process.env.PARSER_INGEST_SECRET) return NextResponse.json({ error: "Not configured" }, { status: 503, headers: responseHeaders });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: responseHeaders });

  const rows = await prisma.opportunity.findMany({
    where: {
      sourceType: "telegram",
      sourceUrl: { startsWith: "https://t.me/" },
      NOT: { sourceUrl: { startsWith: "https://t.me/c/" } },
      status: { in: ["PENDING_REVIEW", "SUSPICIOUS"] },
      moderationStatus: "PENDING",
      applicationDeadline: null,
      deletedAt: null,
      OR: ["дедлайн", "заявк", "регистрац", "deadline", "application", "өтінім", "тіркеу"].map((term) => ({
        fullDescription: { contains: term, mode: "insensitive" as const },
      })),
    },
    orderBy: [{ lastCheckedAt: "asc" }, { id: "asc" }],
    take: 32,
    select: { sourceUrl: true },
  });
  const urls = rows.map((row) => row.sourceUrl).filter((url) => publicPost.safeParse(url).success).slice(0, 8);
  return NextResponse.json({ ok: true, urls }, { headers: responseHeaders });
}

export async function POST(request: NextRequest) {
  if (!process.env.PARSER_INGEST_SECRET) return NextResponse.json({ error: "Not configured" }, { status: 503, headers: responseHeaders });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: responseHeaders });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: responseHeaders });
  }
  const parsed = z.object({ urls: z.array(publicPost).min(1).max(8) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid URLs" }, { status: 422, headers: responseHeaders });
  const updated = await prisma.opportunity.updateMany({
    where: {
      sourceUrl: { in: parsed.data.urls },
      sourceType: "telegram",
      status: { in: ["PENDING_REVIEW", "SUSPICIOUS"] },
      moderationStatus: "PENDING",
      applicationDeadline: null,
      deletedAt: null,
    },
    data: { lastCheckedAt: new Date() },
  });
  return NextResponse.json({ ok: true, checked: updated.count }, { headers: responseHeaders });
}
