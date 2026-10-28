import { assessOpportunityModeration, type ModerationAssessmentInput } from "@/lib/opportunity-moderation";

export type PublicationMedia = {
  processingState: "STAGED" | "READY" | "FAILED";
  rightsState: "PENDING" | "APPROVED" | "REJECTED" | "LICENSED_FALLBACK" | "SOURCE_POST";
  rightsEvidenceRef?: string | null;
  url?: string | null;
  storageKey?: string | null;
  platformMediaId?: string | null;
};

export type PublicationGateInput = Omit<ModerationAssessmentInput, "media"> & { media: PublicationMedia[] };

export function publicationGate(input: PublicationGateInput): { allowed: boolean; reasons: string[] } {
  const assessment = assessOpportunityModeration(input);
  const reasons = [...assessment.blockers, ...assessment.risks];
  return { allowed: assessment.publishAllowed, reasons };
}
