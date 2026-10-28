import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { safeEqual } from "@/lib/timing-safe";
import { candidateSchema, connectorSchema, ingestCandidates } from "@/lib/ingest";
import { parserMediaCapability } from "@/lib/parser-source-media";

export const dynamic = "force-dynamic";

/**
 * Ingest endpoint for the parser service.
 *
 * Auth: `Authorization: Bearer <PARSER_INGEST_SECRET>`.
 * The parser fetches/extracts candidates and posts them here. Validation,
 * deduplication, trust scoring and the PENDING_REVIEW rule all live in
 * `lib/ingest.ts`, shared with the Telegram bot path.
 */

const payloadSchema = z.object({
  connector: connectorSchema,
  items: z.array(candidateSchema).max(200),
});

export async function GET(req: NextRequest) {
  const secret = process.env.PARSER_INGEST_SECRET;
  if (!secret) return NextResponse.json({ error: "Ingest not configured" }, { status: 503 });
  if (!safeEqual(req.headers.get("authorization") || "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { ok: true, ingest: true, ...parserMediaCapability(), maxBatchSize: 200 },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const secret = process.env.PARSER_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Ingest not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`ingest:${ip}`, 30, 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  const result = await ingestCandidates(parsed.data.connector, parsed.data.items);

  return NextResponse.json({
    ok: true,
    accepted: result.failed === 0,
    ...result,
    note: `${result.autoPublished} auto-published, ${result.suspicious} flagged for review; other new opportunities are pending moderation.`,
  });
}
