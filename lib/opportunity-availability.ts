import type { ModerationStatus, OpportunityStatus } from "@prisma/client";

const APPLYABLE_STATUSES = new Set<OpportunityStatus>([
  "PUBLISHED",
  "REGISTRATION_OPEN",
  "DEADLINE_SOON",
]);

export type OpportunityAvailabilityInput = {
  status: OpportunityStatus;
  moderationStatus: ModerationStatus;
  applicationDeadline: Date | string | null;
  deletedAt?: Date | string | null;
};

export type OpportunityAvailability = {
  canApply: boolean;
  expired: boolean;
  reason: "available" | "deadline_passed" | "deadline_unknown" | "closed" | "not_approved" | "deleted";
};

export function getOpportunityAvailability(
  opportunity: OpportunityAvailabilityInput,
  now: Date = new Date(),
): OpportunityAvailability {
  if (opportunity.deletedAt) return { canApply: false, expired: false, reason: "deleted" };
  if (opportunity.moderationStatus !== "APPROVED") {
    return { canApply: false, expired: false, reason: "not_approved" };
  }

  const deadline = opportunity.applicationDeadline
    ? new Date(opportunity.applicationDeadline)
    : null;
  if (!deadline || Number.isNaN(deadline.getTime())) {
    return APPLYABLE_STATUSES.has(opportunity.status)
      ? { canApply: true, expired: false, reason: "deadline_unknown" }
      : { canApply: false, expired: false, reason: "closed" };
  }
  const expired = deadline.getTime() <= now.getTime();
  if (expired) return { canApply: false, expired: true, reason: "deadline_passed" };
  if (!APPLYABLE_STATUSES.has(opportunity.status)) {
    return { canApply: false, expired: false, reason: "closed" };
  }
  return { canApply: true, expired: false, reason: "available" };
}
