import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { safeEqual } from "@/lib/timing-safe";

export const dynamic = "force-dynamic";

const articleSchema = z.object({
  sourceUrl: z.url().max(2048).refine((value) => /^https?:\/\//i.test(value)),
  title: z.string().trim().min(8).max(240),
  summary: z.string().trim().min(20).max(1000),
  topic: z.enum(["it", "ai", "money", "success", "education", "youth"]),
  sourceName: z.string().trim().min(2).max(120),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
  imageUrl: z.url().max(2048).refine((value) => /^https?:\/\//i.test(value)).optional(),
});

const payloadSchema = z.object({ items: z.array(articleSchema).max(100) });

function authorized(req: NextRequest): boolean {
  const secret = process.env.PARSER_INGEST_SECRET;
  return Boolean(secret && safeEqual(req.headers.get("authorization") || "", `Bearer ${secret}`));
}

export async function GET(req: NextRequest) {
  if (!process.env.PARSER_INGEST_SECRET) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ready: true, maxBatchSize: 100 }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  if (!process.env.PARSER_INGEST_SECRET) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = await rateLimit(`parser-news:${ip}`, 30, 60_000);
  if (!limited.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });

  let created = 0;
  let duplicate = 0;
  for (const item of parsed.data.items) {
    const sourceUrl = new URL(item.sourceUrl);
    sourceUrl.hash = "";
    const result = await prisma.newsArticle.createMany({
      data: [{
        sourceUrl: sourceUrl.toString(),
        title: item.title,
        summary: item.summary,
        topic: item.topic,
        sourceName: item.sourceName,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date(),
        imageUrl: item.imageUrl,
      }],
      skipDuplicates: true,
    });
    created += result.count;
    duplicate += 1 - result.count;
  }

  return NextResponse.json({ ok: true, created, duplicate, pendingReview: created });
}
