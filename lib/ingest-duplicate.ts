export type PublishedOpportunityForDuplicate = {
  id: string;
  title: string;
  organizerName: string;
  applicationUrl: string | null;
  applicationDeadline: Date | null;
};

const TRACKING_PARAMETER = /^(?:utm_.+|fbclid|gclid|gbraid|wbraid|yclid|igshid|mc_cid|mc_eid|ref|referral|referrer|source|campaign|affiliate|aff|_hsenc|_hsmi)$/i;
const TITLE_STOPWORDS = new Set(["и", "в", "на", "для", "по", "от", "с", "the", "a", "an", "of", "for", "in", "2025", "2026", "2027"]);
const SHARED_APPLICATION_HOSTS = new Set([
  "google.com", "microsoft.com", "office.com", "typeform.com", "tally.so", "jotform.com",
  "airtable.com", "notion.site", "eventbrite.com", "lu.ma", "forms.app", "formstack.com",
]);

export function canonicalApplicationUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "").toLowerCase() || "/";
    const params = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAMETER.test(key))
      .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
    const query = new URLSearchParams(params).toString();
    return `${host}${path}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/ё/g, "е").match(/[\p{L}\p{N}]+/gu)
    ?.filter((part) => part.length > 2 && !TITLE_STOPWORDS.has(part)) ?? []);
}

function titleOverlap(first: string, second: string): number {
  const a = tokens(first);
  const b = tokens(second);
  if (a.size < 2 || b.size < 2) return 0;
  const common = [...a].filter((token) => b.has(token)).length;
  return common / Math.min(a.size, b.size);
}

function sameOrganizerWebDomain(first: string | null | undefined, second: string | null | undefined): boolean {
  if (!first || !second) return false;
  try {
    const a = new URL(first).hostname.toLowerCase().replace(/^www\./, "");
    const b = new URL(second).hostname.toLowerCase().replace(/^www\./, "");
    if ([a, b].some((host) => [...SHARED_APPLICATION_HOSTS].some((shared) => host === shared || host.endsWith(`.${shared}`)))) return false;
    return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
  } catch {
    return false;
  }
}

export function likelySamePublishedOpportunity(
  incoming: Pick<PublishedOpportunityForDuplicate, "title" | "organizerName" | "applicationUrl" | "applicationDeadline">,
  existing: PublishedOpportunityForDuplicate,
): boolean {
  const incomingDeadline = incoming.applicationDeadline;
  const existingDeadline = existing.applicationDeadline;
  if (incomingDeadline && existingDeadline && Math.abs(incomingDeadline.getTime() - existingDeadline.getTime()) > 36 * 60 * 60 * 1000) return false;

  const sameApplication = canonicalApplicationUrl(incoming.applicationUrl) !== null &&
    canonicalApplicationUrl(incoming.applicationUrl) === canonicalApplicationUrl(existing.applicationUrl);
  const overlap = titleOverlap(incoming.title, existing.title);
  const organizer = incoming.organizerName.trim().toLowerCase().replace(/ё/g, "е");
  const sameOrganizer = organizer.length >= 5 && organizer === existing.organizerName.trim().toLowerCase().replace(/ё/g, "е");

  if (sameApplication && overlap >= 0.6) return true;
  if (sameOrganizerWebDomain(incoming.applicationUrl, existing.applicationUrl) && overlap >= 0.9 &&
    Boolean(incomingDeadline && existingDeadline)) return true;
  return sameOrganizer && overlap >= 0.8 && Boolean(incomingDeadline && existingDeadline);
}

export function duplicateReviewFromProvenance(value: unknown): { matchedOpportunityId: string; reason: string; resolvedAt?: string; evidenceRef?: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const review = record.potentialDuplicate;
  if (review && typeof review === "object" && !Array.isArray(review)) {
    const data = review as Record<string, unknown>;
    if (typeof data.matchedOpportunityId === "string" && typeof data.reason === "string") {
      return {
        matchedOpportunityId: data.matchedOpportunityId,
        reason: data.reason,
        ...(typeof data.resolvedAt === "string" ? { resolvedAt: data.resolvedAt } : {}),
        ...(typeof data.evidenceRef === "string" ? { evidenceRef: data.evidenceRef } : {}),
      };
    }
  }
  if (typeof record.duplicateOfOpportunityId === "string" && record.duplicateOfOpportunityId.trim()) {
    return { matchedOpportunityId: record.duplicateOfOpportunityId, reason: "known_duplicate" };
  }
  return null;
}
