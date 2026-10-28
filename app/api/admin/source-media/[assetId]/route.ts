import { NextResponse } from "next/server";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { sourceMediaRedirectTarget } from "@/lib/source-media-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

async function handle({ params }: { params: Promise<{ assetId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) {
    return NextResponse.json({ error: "Media unavailable" }, { status: 404, headers: responseHeaders });
  }
  const { assetId } = await params;
  const target = await sourceMediaRedirectTarget(assetId, true);
  if (!target) return NextResponse.json({ error: "Media unavailable" }, { status: 404, headers: responseHeaders });
  return NextResponse.redirect(target, { status: 307, headers: responseHeaders });
}

export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  return handle(context);
}

export async function HEAD(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  return handle(context);
}
