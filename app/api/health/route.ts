import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe. Returns 200 only when the database answers a
 * trivial query, so an uptime monitor (or Vercel) can tell "process is up" from
 * "process is up but cannot serve requests". Never cached, never authenticated.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "up",
      latencyMs: Date.now() - startedAt,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", db: "down", latencyMs: Date.now() - startedAt },
      { status: 503 },
    );
  }
}
