type ReleaseCandidate = {
  applicationUrl: string | null;
  country: string;
  tags: readonly string[];
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
