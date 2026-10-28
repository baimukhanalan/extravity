import {
  assessOpportunityModeration,
  type ModerationAssessmentInput,
} from "@/lib/opportunity-moderation";

export type ModerationQueueSummary = {
  total: number;
  withMedia: number;
  missingApplicationUrl: number;
  missingDeadline: number;
  expiredDeadline: number;
  missingApprovedMedia: number;
  onlyMediaRightsPending: number;
  otherwiseReady: number;
};

export function summarizeModerationQueue(
  opportunities: Array<Omit<ModerationAssessmentInput, "moderationStatus" | "now">>,
  now: Date,
): ModerationQueueSummary {
  const summary: ModerationQueueSummary = {
    total: opportunities.length,
    withMedia: 0,
    missingApplicationUrl: 0,
    missingDeadline: 0,
    expiredDeadline: 0,
    missingApprovedMedia: 0,
    onlyMediaRightsPending: 0,
    otherwiseReady: 0,
  };

  for (const opportunity of opportunities) {
    if (opportunity.media.length > 0) summary.withMedia += 1;
    const assessment = assessOpportunityModeration({
      ...opportunity,
      moderationStatus: "APPROVED",
      now,
    });
    if (assessment.blockers.includes("application_url_missing")) summary.missingApplicationUrl += 1;
    if (assessment.blockers.includes("deadline_missing")) summary.missingDeadline += 1;
    if (assessment.blockers.includes("deadline_expired")) summary.expiredDeadline += 1;
    if (assessment.blockers.includes("approved_media_missing")) summary.missingApprovedMedia += 1;
    if (assessment.publishAllowed) summary.otherwiseReady += 1;
    if (
      assessment.risks.length === 0 &&
      assessment.blockers.length === 1 &&
      assessment.blockers[0] === "approved_media_missing" &&
      opportunity.media.some((media) => media.processingState === "READY" && media.rightsState === "PENDING")
    ) {
      summary.onlyMediaRightsPending += 1;
    }
  }

  return summary;
}
