import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { safeEqual } from "@/lib/timing-safe";

export const dynamic = "force-dynamic";

const STATE_URL = "telegram-state://primary";
const keySchema = z.string().min(1).max(300);
const valueSchema = z.string().regex(/^\d{1,100}$/);
const payloadSchema = z.object({
  state: z.record(keySchema, valueSchema).refine((value) => Object.keys(value).length <= 10_000),
});

function authorized(req: NextRequest): boolean {
  const secret = process.env.PARSER_INGEST_SECRET;
  return Boolean(secret && safeEqual(req.headers.get("authorization") || "", `Bearer ${secret}`));
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await prisma.rawSourceItem.findFirst({
    where: { url: STATE_URL, processingState: "state" },
    orderBy: { createdAt: "desc" },
    select: { extracted: true },
  });
  const parsed = payloadSchema.safeParse({ state: row?.extracted ?? {} });
  return NextResponse.json(
    { ok: true, state: parsed.success ? parsed.data.state : {} },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });

  const existing = await prisma.rawSourceItem.findFirst({
    where: { url: STATE_URL, processingState: "state" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) {
    await prisma.rawSourceItem.update({ where: { id: existing.id }, data: { extracted: parsed.data.state } });
  } else {
    await prisma.rawSourceItem.create({
      data: { url: STATE_URL, processingState: "state", extracted: parsed.data.state },
    });
  }
  return NextResponse.json({ ok: true, entries: Object.keys(parsed.data.state).length });
}
