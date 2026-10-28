import { z } from "zod";
import { contentRisks } from "./opportunity-moderation";
import { isAllowedParserMedia, isTrustedTelegramArchiveCandidate } from "./parser-source-media";

/**
 * Pure ingestion rules: candidate/connector shapes, trust scoring and the
 * auto-publish gate. No database, no `server-only` — so these can be unit
 * tested directly and imported from anywhere. The DB side lives in `lib/ingest.ts`.
 */

export const candidateSchema = z.object({
  title: z.string().min(3).max(300),
  shortDescription: z.string().min(3).max(500),
  fullDescription: z.string().max(8000).optional(),
  categorySlug: z.string().min(1),
  tags: z.array(z.string()).max(20).default([]),
  organizerName: z.string().min(1).max(200),
  organizerEvidence: z.enum(["SOURCE_TEXT", "SOURCE_CHANNEL_UNVERIFIED"]).optional(),
  audienceStatus: z.enum(["SCHOOL", "NON_SCHOOL", "UNKNOWN"]).optional(),
  audienceEvidence: z.string().max(200).optional(),
  country: z.string().trim().min(1).max(100).optional(),
  city: z.string().max(100).optional(),
  format: z.enum(["ONLINE", "OFFLINE", "HYBRID"]).optional(),
  sourceUrl: z.string().url(),
  sourcePublishedAt: z.string().datetime({ offset: true }).optional(),
  sourceEditedAt: z.string().datetime({ offset: true }).optional(),
  applicationUrl: z.string().url().optional(),
  minimumAge: z.number().int().min(1).max(100).optional(),
  maximumAge: z.number().int().min(1).max(100).optional(),
  minimumGrade: z.number().int().min(1).max(12).optional(),
  maximumGrade: z.number().int().min(1).max(12).optional(),
  applicationDeadline: z.string().datetime({ offset: true }).optional(),
  eventStartDate: z.string().datetime({ offset: true }).optional(),
  price: z.number().int().min(0).optional(),
  priceEvidenceUrl: z.string().url().max(1000).refine((value) => value.startsWith("https://")).optional(),
  priceEvidenceText: z.string().trim().min(1).max(240).optional(),
  participationType: z.enum(["INDIVIDUAL", "TEAM", "BOTH"]).optional(),
  requiredDocuments: z.array(z.string()).max(20).default([]),
  requirements: z.array(z.string()).max(30).default([]),
  prizes: z.string().max(2000).optional(),
  originalLanguage: z.string().default("ru"),
  confidence: z.number().min(0).max(1).optional(),
  contentHash: z.string().optional(),
  refreshExistingPendingOnly: z.boolean().optional(),
  media: z.array(z.object({
    kind: z.enum(["IMAGE", "VIDEO"]),
    url: z.string().url(),
    posterUrl: z.string().url().optional(),
    storageKey: z.string().min(1).max(500).optional(),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]),
    sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationMs: z.number().int().positive().optional(),
    position: z.number().int().min(0).max(9),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    platformMediaId: z.string().min(1).max(200),
    rightsState: z.literal("APPROVED").optional(),
    rightsBasis: z.enum(["ORGANIZER_OWNED", "EXPLICIT_LICENSE", "OPEN_LICENSE"]).optional(),
    rightsEvidenceUrl: z.string().url().optional(),
  }).refine(isAllowedParserMedia, { message: "Media URL is not an approved storage URL" })).max(10).default([]),
});

export type Candidate = z.infer<typeof candidateSchema>;

export const connectorSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  url: z.string().url(),
});

export type Connector = z.infer<typeof connectorSchema>;

export function sourceAccessScope(sourceUrl: string): "PUBLIC" | "PRIVATE" {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    if (["t.me", "telegram.me"].includes(host) && (/^\/c\/\d+(?:\/|$)/.test(url.pathname) || /^\/(?:\+|joinchat\/)/i.test(url.pathname))) return "PRIVATE";
    if (host === "chat.whatsapp.com") return "PRIVATE";
  } catch {
    return "PRIVATE";
  }
  return "PUBLIC";
}

export function shouldAutoPublishParsedTelegram(connectorType: string, item: Candidate): boolean {
  if (!['telegram', 'telegram_forward'].includes(connectorType.toLowerCase())) return false;
  if (sourceAccessScope(item.sourceUrl) !== "PUBLIC") return false;
  try {
    const source = new URL(item.sourceUrl);
    if (!['t.me', 'telegram.me'].includes(source.hostname.toLowerCase())) return false;
    if (!/^\/[A-Za-z0-9_]{3,}\/\d+$/.test(source.pathname)) return false;
  } catch {
    return false;
  }
  if (!hasSpecificTitle(item.title) || hasContentWarning(item)) return false;
  if (!item.sourcePublishedAt) return false;
  const now = new Date();
  const publishedAt = new Date(item.sourcePublishedAt);
  if (!Number.isFinite(publishedAt.getTime()) || publishedAt > new Date(now.getTime() + 24 * 60 * 60 * 1000)) return false;
  const deadline = item.applicationDeadline ? new Date(item.applicationDeadline) : null;
  if (deadline && deadline <= now) return false;
  const eventStart = item.eventStartDate ? new Date(item.eventStartDate) : null;
  if (eventStart && eventStart <= now) return false;
  const text = `${item.title}\n${item.shortDescription}\n${item.fullDescription ?? ""}`;
  if (/\b(?:recap|highlights?)\b|(?:^|\s)(?:итоги|как это было)(?:\s|$)/i.test(text)) return false;
  const hasOpenSignal = /(?:открыт|стартовал).{0,25}(?:регистрац|при[её]м|набор|applications?|registration)|(?:при[её]м|подач|регистрац|набор).{0,35}(?:открыт|ид[её]т|продолж|до)|(?:заявк|работ|документ).{0,25}(?:принима|подать)|(?:applications?|registration|submissions?|enrollment).{0,35}(?:open|close|due|apply)|(?:apply|register|sign\s*up|submit)\s+(?:now|here|by|before)/i.test(text);
  if (!hasOpenSignal) return false;
  if (!hasDirectApplicationUrl(item.applicationUrl)) return false;
  if (!deadline) {
    const freshCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (publishedAt < freshCutoff) return false;
  }
  return item.media.length > 0 && item.media.every((media) =>
    isTrustedTelegramArchiveCandidate(media)
    && media.platformMediaId.trim().length > 0
    && media.position >= 0,
  );
}

// Only these connector types are ever eligible for auto-publish. Social forwards
// and plain scraped pages always wait for a human, however confident the parse.
const AUTO_PUBLISH_SOURCE_TYPES = new Set(["official_site", "government", "university", "rss", "sitemap"]);
const AUTO_PUBLISH_MIN_TRUST = 70;
const AUTO_PUBLISH_MIN_CONFIDENCE = 0.8;

const INDIRECT_APPLICATION_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "t.me",
  "telegram.me",
  "wa.me",
  "whatsapp.com",
  "www.whatsapp.com",
]);

export type AutoPublishBlocker =
  | "source_type_not_eligible"
  | "source_origin_not_approved"
  | "source_origin_mismatch"
  | "source_url_not_https"
  | "trust_below_threshold"
  | "confidence_below_threshold"
  | "organizer_missing"
  | "title_not_specific"
  | "deadline_missing_or_expired"
  | "application_url_missing_or_indirect"
  | "licensed_media_missing"
  | "eligibility_review_missing"
  | "country_missing"
  | "format_missing"
  | "price_missing"
  | "content_not_open_opportunity"
  | "audience_unverified";

/** Terms that cannot be represented as unknown in Opportunity's current schema. */
export function missingMaterialTerms(item: Candidate): Array<"country" | "format" | "price"> {
  const missing: Array<"country" | "format" | "price"> = [];
  if (!item.country?.trim()) missing.push("country");
  if (!item.format) missing.push("format");
  if (item.price === undefined) missing.push("price");
  return missing;
}

export type AutoPublishContext = {
  connectorUrl: string;
  approvedSourceOrigins: ReadonlySet<string>;
  eligibilityReviewEvidenceRef?: string;
  now?: Date;
};

function normalizedOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin.toLowerCase() : null;
  } catch {
    return null;
  }
}

function sourceMatchesConnector(sourceUrl: string, connectorUrl: string): boolean {
  try {
    const source = new URL(sourceUrl);
    const connector = new URL(connectorUrl);
    return (
      source.protocol === "https:" &&
      connector.protocol === "https:" &&
      (source.hostname === connector.hostname || source.hostname.endsWith(`.${connector.hostname}`))
    );
  } catch {
    return false;
  }
}

function hasSpecificTitle(title: string): boolean {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (normalized.length < 8) return false;
  return !/^(всем привет|друзья|как |мы рады|мы тут|открываем набор|ищешь |билеты на|объявлен список)/i.test(normalized);
}

function hasDirectApplicationUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !INDIRECT_APPLICATION_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function hasContentWarning(item: Candidate): boolean {
  return contentRisks({ title: item.title }).some((risk) => risk !== "confidence_below_review_threshold");
}

export function shouldFlagCandidateSuspicious(item: Candidate, trust: number): boolean {
  return trust < 40 || item.audienceStatus === "UNKNOWN" || hasContentWarning(item);
}

/**
 * Explain the fail-closed auto-publication decision. A trusted-looking score
 * alone is never sufficient: the source origin must be explicitly allowlisted,
 * the application must still be open, and media needs recorded usage rights.
 */
export function assessAutoPublication(
  connectorType: string,
  item: Candidate,
  trust: number,
  context: AutoPublishContext,
): { allowed: boolean; blockers: AutoPublishBlocker[] } {
  const blockers: AutoPublishBlocker[] = [];
  const sourceOrigin = normalizedOrigin(item.sourceUrl);
  const connectorOrigin = normalizedOrigin(context.connectorUrl);
  const now = context.now ?? new Date();

  if (!AUTO_PUBLISH_SOURCE_TYPES.has(connectorType.toLowerCase())) blockers.push("source_type_not_eligible");
  if (!sourceOrigin) blockers.push("source_url_not_https");
  if (!sourceOrigin || !connectorOrigin || !context.approvedSourceOrigins.has(connectorOrigin)) blockers.push("source_origin_not_approved");
  if (!sourceMatchesConnector(item.sourceUrl, context.connectorUrl)) blockers.push("source_origin_mismatch");
  if (trust < AUTO_PUBLISH_MIN_TRUST) blockers.push("trust_below_threshold");
  if ((item.confidence ?? 0) < AUTO_PUBLISH_MIN_CONFIDENCE) blockers.push("confidence_below_threshold");
  if (!item.organizerName.trim()) blockers.push("organizer_missing");
  if (!hasSpecificTitle(item.title)) blockers.push("title_not_specific");
  if (!item.applicationDeadline || new Date(item.applicationDeadline) <= now) blockers.push("deadline_missing_or_expired");
  if (!hasDirectApplicationUrl(item.applicationUrl)) blockers.push("application_url_missing_or_indirect");
  if (!item.audienceStatus || item.audienceStatus === "UNKNOWN" || !item.audienceEvidence?.trim()) blockers.push("audience_unverified");
  if (!context.eligibilityReviewEvidenceRef || context.eligibilityReviewEvidenceRef.trim().length < 8) blockers.push("eligibility_review_missing");
  for (const term of missingMaterialTerms(item)) blockers.push(`${term}_missing`);
  if (hasContentWarning(item)) blockers.push("content_not_open_opportunity");
  if (!item.media.some((media) => {
    if (!media.rightsState || !media.rightsBasis || !media.rightsEvidenceUrl) return false;
    const evidenceOrigin = normalizedOrigin(media.rightsEvidenceUrl);
    return Boolean(evidenceOrigin && !INDIRECT_APPLICATION_HOSTS.has(new URL(media.rightsEvidenceUrl).hostname.toLowerCase()));
  })) blockers.push("licensed_media_missing");

  return { allowed: blockers.length === 0, blockers };
}

/**
 * Whether a candidate may skip the moderation queue, when the
 * `auto_publish_trusted` flag is on. The bar is deliberately high: a verified
 * kind of source, both a deadline and an apply link present, and strong parse
 * confidence. Anything short of all four still goes to a moderator.
 */
export function shouldAutoPublish(
  connectorType: string,
  item: Candidate,
  trust: number,
  context: AutoPublishContext,
): boolean {
  return assessAutoPublication(connectorType, item, trust, context).allowed;
}

/** Deterministic trust score from source signals (never a guarantee). */
export function computeTrust(type: string, item: Candidate): number {
  let score = 40;
  const t = type.toLowerCase();
  if (["official_site", "government", "university"].includes(t)) score += 25;
  else if (["ngo", "foundation"].includes(t)) score += 15;
  else if (t === "rss" || t === "sitemap") score += 10;
  // A social post is a lead, not a primary source: the claim still has to be
  // checked against the organizer's own page before a student relies on it.
  else if (["telegram", "telegram_forward", "instagram", "instagram_forward", "whatsapp_export", "whatsapp_cloud"].includes(t)) score -= 5;
  if (item.applicationUrl) score += 8;
  if (item.applicationDeadline) score += 7;
  if (item.requirements.length > 0) score += 5;
  if (/гарант|guarantee|100%/i.test(item.title + " " + (item.fullDescription ?? ""))) score -= 30;
  return Math.max(5, Math.min(95, score));
}
