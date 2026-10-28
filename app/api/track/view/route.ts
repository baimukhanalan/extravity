import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Aggregate view counter for organizer analytics. Deliberately anonymous:
 * we store a per-opportunity daily tally, never who viewed what.
 *
 * Rate-limited per IP: the endpoint is unauthenticated by design (anonymous
 * views), so without a cap someone could inflate an organizer's view/conversion
 * numbers. The client already de-dupes per browser session; this caps abuse.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`view:${ip}`, 120, 60 * 1000);
  if (!rl.ok) return NextResponse.json({ ok: false }, { status: 429 });

  let opportunityId: string | undefined;
  try {
    const body = await request.json();
    opportunityId = typeof body?.opportunityId === "string" ? body.opportunityId : undefined;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!opportunityId) return NextResponse.json({ ok: false }, { status: 400 });

  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);

  try {
    await prisma.$transaction([
      prisma.opportunity.update({
        where: { id: opportunityId },
        data: { viewCount: { increment: 1 } },
      }),
      prisma.opportunityView.upsert({
        where: { opportunityId_day: { opportunityId, day } },
        create: { opportunityId, day, count: 1 },
        update: { count: { increment: 1 } },
      }),
    ]);
  } catch {
    // Unknown id or a race on the daily row — counting is best-effort.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  return NextResponse.json({ ok: true });
}
