import type { ApplicationStatus } from "@prisma/client";
const ALLOWED: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  CONSIDERING: ["SAVED", "PREPARING", "WITHDRAWN"],
  SAVED: ["CONSIDERING", "PREPARING", "WITHDRAWN"],
  PREPARING: ["DOCUMENTS_MISSING", "READY_FOR_REVIEW", "WITHDRAWN"],
  DOCUMENTS_MISSING: ["PREPARING", "READY_FOR_REVIEW", "WITHDRAWN"],
  READY_FOR_REVIEW: ["PREPARING", "DOCUMENTS_MISSING", "READY_TO_SUBMIT", "WITHDRAWN"],
  READY_TO_SUBMIT: ["PREPARING", "SUBMITTED", "WITHDRAWN"],
  SUBMITTED: ["INTERVIEW", "WAITLISTED", "ACCEPTED", "REJECTED", "WITHDRAWN"],
  INTERVIEW: ["WAITLISTED", "ACCEPTED", "REJECTED", "WITHDRAWN"],
  WAITLISTED: ["INTERVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"],
  ACCEPTED: ["COMPLETED", "WITHDRAWN"],
  REJECTED: ["COMPLETED"],
  WITHDRAWN: ["PREPARING"],
  COMPLETED: [],
};

export function allowedApplicationStatuses(current: ApplicationStatus): readonly ApplicationStatus[] {
  return ALLOWED[current];
}

export function canTransitionApplicationStatus(
  current: ApplicationStatus,
  next: ApplicationStatus,
): boolean {
  return ALLOWED[current].includes(next);
}
