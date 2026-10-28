import type { ApplicationStatus, Prisma } from "@prisma/client";

export const ORGANIZER_VISIBLE_APPLICATION_STATUSES: ApplicationStatus[] = [
  "SUBMITTED",
  "INTERVIEW",
  "WAITLISTED",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "COMPLETED",
];

export function organizerVisibleApplicationWhere(organizerId: string): Prisma.ApplicationWhereInput {
  return {
    opportunity: { organizerId },
    status: { in: ORGANIZER_VISIBLE_APPLICATION_STATUSES },
  };
}
