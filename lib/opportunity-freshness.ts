import type { Prisma } from "@prisma/client";

export const PUBLIC_EXPIRED_GRACE_DAYS = 10;

export function publicExpiredCutoff(now: Date): Date {
  return new Date(now.getTime() - PUBLIC_EXPIRED_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

export function archiveEligibleWhere(now: Date): Prisma.OpportunityWhereInput {
  return {
    status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON", "CLOSED"] },
    applicationDeadline: { lte: publicExpiredCutoff(now) },
    deletedAt: null,
  };
}

export function recentlyExpiredWhere(now: Date): Prisma.OpportunityWhereInput {
  return {
    status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON", "CLOSED"] },
    applicationDeadline: { gt: publicExpiredCutoff(now), lte: now },
    deletedAt: null,
  };
}
