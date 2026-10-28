import type { Prisma } from "@prisma/client";
import { getOpportunityAvailability, type OpportunityAvailabilityInput } from "@/lib/opportunity-availability";

export function applicationHistoryWhere(userId: string): Prisma.ApplicationWhereInput {
  return { userId };
}

export function partitionApplicationsByAvailability<T extends { opportunity: OpportunityAvailabilityInput }>(
  applications: T[],
  now: Date = new Date(),
): { current: T[]; historical: T[] } {
  const current: T[] = [];
  const historical: T[] = [];
  for (const application of applications) {
    (getOpportunityAvailability(application.opportunity, now).canApply ? current : historical).push(application);
  }
  return { current, historical };
}
