type ReleaseCandidate = {
  applicationUrl: string | null;
  country: string;
  tags: readonly string[];
  provenance: unknown;
};

type ReviewedReleaseCandidate = {
  verifiedAt: Date | null;
  organizerVerified: string;
  provenance: unknown;
};

const indirectHosts = new Set([
  "t.me",
  "telegram.me",
  "wa.me",
  "whatsapp.com",
  "www.whatsapp.com",
  "instagram.com",
  "www.instagram.com",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function directApplicationUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !indirectHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Only an explicit, evidence-bound manual review may use the verified card flow. */
export function isOfficiallyReviewedTelegramRelease(candidate: ReviewedReleaseCandidate): boolean {
  const provenance = record(candidate.provenance);
  const officialPage = provenance.officialPage;
  const reviewedAt = provenance.reviewedAt;
  return candidate.verifiedAt instanceof Date
    && !Number.isNaN(candidate.verifiedAt.getTime())
    && candidate.organizerVerified === "VERIFIED"
    && provenance.publicListingMode === "officially_reviewed"
    && typeof reviewedAt === "string"
    && Number.isFinite(Date.parse(reviewedAt))
    && Date.parse(reviewedAt) <= Date.now()
    && typeof officialPage === "string"
    && directApplicationUrl(officialPage)
    && provenance.organizerOfficialEvidence === officialPage
    && provenance.priceEvidenceUrl === officialPage
    && typeof provenance.priceEvidenceText === "string"
    && Boolean(provenance.priceEvidenceText.trim())
    && typeof provenance.deadlineEvidence === "string"
    && Boolean(provenance.deadlineEvidence.trim())
    && typeof provenance.countryEvidence === "string"
    && Boolean(provenance.countryEvidence.trim())
    && provenance.audienceStatus === "SCHOOL"
    && provenance.organizerEvidence === "SOURCE_TEXT"
    && Array.isArray(provenance.ingestUnknownTerms)
    && provenance.ingestUnknownTerms.length === 0;
}

/** Parsed rows need explicit source terms before a reviewed release can publish them. */
export function parsedTelegramReleaseBlockers(candidate: ReleaseCandidate): string[] {
  const provenance = record(candidate.provenance);
  const blockers: string[] = [];
  if (provenance.audienceStatus !== "SCHOOL" ||
      typeof provenance.audienceEvidence !== "string" ||
      !provenance.audienceEvidence.trim()) {
    blockers.push("school_audience_unverified");
  }
  if (provenance.organizerEvidence !== "SOURCE_TEXT") {
    blockers.push("organizer_unverified");
  }
  if (!Array.isArray(provenance.ingestUnknownTerms) ||
      provenance.ingestUnknownTerms.length > 0) {
    blockers.push("material_terms_unverified");
  }
  if (!candidate.country.trim() || candidate.country === "Unspecified") {
    blockers.push("country_unverified");
  }
  if (candidate.tags.includes("география ограничена")) {
    blockers.push("kazakhstan_eligibility_restricted");
  }
  if (!directApplicationUrl(candidate.applicationUrl)) {
    blockers.push("direct_application_url_missing");
  }
  return blockers;
}
