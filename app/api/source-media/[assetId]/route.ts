import { NextResponse } from "next/server";
import { sourceMediaRedirectTarget } from "@/lib/source-media-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

async function handle({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const target = await sourceMediaRedirectTarget(assetId);
  if (!target) return NextResponse.json({ error: "Media unavailable" }, { status: 404, headers: responseHeaders });
  return NextResponse.redirect(target, { status: 307, headers: responseHeaders });
}

export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  return handle(context);
}

export async function HEAD(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  return handle(context);
}
