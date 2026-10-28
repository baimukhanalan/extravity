import { isOriginalTelegramPostMedia } from "./source-media-provenance";

export const MODERATION_MIN_CONFIDENCE = 70;

export type ModerationBlockerCode =
  | "organizer_missing"
  | "application_url_missing"
  | "application_url_invalid"
  | "application_url_matches_source"
  | "deadline_missing"
  | "deadline_invalid"
  | "deadline_expired"
  | "material_terms_unverified"
  | "audience_unverified"
  | "potential_duplicate_review_required"
  | "approved_media_missing"
  | "moderation_not_approved";

export type ModerationRiskCode =
  | "content_resembles_retrospective"
  | "content_resembles_news"
  | "content_resembles_promotion"
  | "confidence_below_review_threshold";

export type ModerationAssessmentInput = {
  title?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  organizerName: string;
  sourceUrl?: string | null;
  applicationUrl: string | null;
  applicationDeadline: Date | null;
  confidenceScore?: number | null;
  country?: string | null;
  ingestUnknownTerms?: string[];
  allowUnknownPrice?: boolean;
  audienceStatus?: "SCHOOL" | "NON_SCHOOL" | "UNKNOWN";
  sourceType?: string | null;
  duplicateReviewRequired?: boolean;
  moderationStatus: string;
  media: Array<{
    processingState: "STAGED" | "READY" | "FAILED";
    rightsState: "PENDING" | "APPROVED" | "REJECTED" | "LICENSED_FALLBACK" | "SOURCE_POST";
    rightsEvidenceRef?: string | null;
    url?: string | null;
    storageKey?: string | null;
    platformMediaId?: string | null;
  }>;
  now?: Date;
};

export type ModerationAssessment = {
  publishAllowed: boolean;
  blockers: ModerationBlockerCode[];
  risks: ModerationRiskCode[];
};

export function ingestUnknownTermsFromProvenance(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const terms = (value as Record<string, unknown>).ingestUnknownTerms;
  if (!Array.isArray(terms)) return [];
  return terms.filter((term): term is string =>
    typeof term === "string" && ["country", "format", "price"].includes(term));
}

export function audienceStatusFromProvenance(value: unknown): "SCHOOL" | "NON_SCHOOL" | "UNKNOWN" {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "UNKNOWN";
  const status = (value as Record<string, unknown>).audienceStatus;
  return status === "SCHOOL" || status === "NON_SCHOOL" ? status : "UNKNOWN";
}

const RETROSPECTIVE_PATTERNS = [
  /подвел[аи]?\s+итоги/iu,
  /поздравля(?:ем|ет|ют)\s+(?:наших\s+)?победител/iu,
  /(?:мероприятие|конкурс|олимпиада|хакатон|форум)\s+(?:успешно\s+)?(?:прош[её]л|состоял[ао]сь|завершил[ао]сь)/iu,
  /итоги\s+(?:конкурса|олимпиады|хакатона|форума)/iu,
  /\b(?:winner|winners|finalists?)\s+(?:announced|of)\b/i,
  /\b(?:event|competition|hackathon)\s+(?:was\s+)?(?:held|completed|concluded)\b/i,
  /(?:жеңімпаздар|финалистер)\s+(?:анықталды|жарияланды)/iu,
  /(?:байқау|олимпиада|форум)\s+(?:сәтті\s+)?(?:өтті|аяқталды)/iu,
];

const RETROSPECTIVE_TITLE_PATTERNS = [
  /(?:итоги|қорытынды)/iu,
  /(?:финалист\w*|победител\w*|жеңімпаз\w*)/iu,
  /(?:как\s+прош[её]л|how\s+.+\s+went)/iu,
  /(?:состоял[ао]сь|состоялся|прош[её]л|завершил[ао]сь|выш[её]л\s+в\s+финал)/iu,
  /\b(?:was\s+held|has\s+ended|made\s+the\s+final)\b/i,
];

const NEWS_PATTERNS = [
  /(?:жаңалықтар|новости)/iu,
  /(?:подписал[аи]?|заключил[аи]?)\s+(?:меморандум|соглашение)/iu,
  /(?:объявил[аи]?|запустил[аи]?)\s+(?:новый\s+)?(?:фонд|партн[её]рство|инициативу)/iu,
  /\b(?:announces?|launches?)\s+(?:a\s+)?(?:fund|partnership|initiative)\b/i,
  /\b(?:memorandum|partnership)\s+(?:signed|announced)\b/i,
  /(?:меморандум|серіктестік)\s+(?:жасалды|жарияланды)/iu,
  /стал[ао]?\s+(?:информационным\s+)?партн[её]ром/iu,
];

const PROMOTION_PATTERNS = [
  /(?:скидк\w*|промокод\w*|распродаж\w*)/iu,
  /(?:купи|покупай|приобрети)\s+(?:билет|курс|подписку)/iu,
  /(?:розыгрыш|giveaway|win\s+a\s+prize)/iu,
  /\b(?:sale|discount|promo\s*code)\b/i,
  /(?:жеңілдік|промокод|ұтыс)/iu,
];

const PROMOTION_TITLE_PATTERNS = [/(?:билет\w*|tickets?|ищешь\s+канал|подписывай(?:тесь|ся)\s+на\s+канал)/iu];
const OPEN_OPPORTUNITY_TITLE = /(?:хакатон|hackathon|олимпиад|olympiad|конкурс|competition|case\s+challenge|fair|ярмарк|волонт|volunteer|стажиров|internship|летн\w*\s+школ|summer\s+school|курс|course|программ|program|форум|forum|турнир|tournament|bootcamp|акселератор)/iu;

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function canonicalUrl(value: string): string | null {
  if (!isValidHttpUrl(value)) return null;
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.searchParams.sort();
  return parsed.toString().replace(/\/$/, "").toLowerCase();
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function contentRisks(input: Pick<ModerationAssessmentInput, "title" | "shortDescription" | "fullDescription" | "confidenceScore">): ModerationRiskCode[] {
  const risks: ModerationRiskCode[] = [];
  const title = input.title ?? "";
  const openTitle = OPEN_OPPORTUNITY_TITLE.test(title);
  const content = [title, input.shortDescription, input.fullDescription]
    .filter((value): value is string => Boolean(value))
    .join("\n");
  if (matchesAny(title, RETROSPECTIVE_TITLE_PATTERNS) || matchesAny(title, RETROSPECTIVE_PATTERNS)
    || (!openTitle && matchesAny(content, RETROSPECTIVE_PATTERNS))) {
    risks.push("content_resembles_retrospective");
  }
  if (matchesAny(title, NEWS_PATTERNS) || (!openTitle && matchesAny(content, NEWS_PATTERNS))) {
    risks.push("content_resembles_news");
  }
  if (matchesAny(title, PROMOTION_PATTERNS) || matchesAny(title, PROMOTION_TITLE_PATTERNS)
    || (!openTitle && matchesAny(content, PROMOTION_PATTERNS))) {
    risks.push("content_resembles_promotion");
  }
  if (typeof input.confidenceScore === "number" && input.confidenceScore < MODERATION_MIN_CONFIDENCE) {
    risks.push("confidence_below_review_threshold");
  }
  return risks;
}

export function assessOpportunityModeration(input: ModerationAssessmentInput): ModerationAssessment {
  const now = input.now ?? new Date();
  const blockers: ModerationBlockerCode[] = [];

  if (!input.organizerName.trim()) blockers.push("organizer_missing");
  if (["telegram", "telegram_forward", "instagram", "instagram_forward", "whatsapp_export", "whatsapp_cloud"].includes(input.sourceType?.toLowerCase() ?? "")
    && input.audienceStatus !== "SCHOOL" && input.audienceStatus !== "NON_SCHOOL") blockers.push("audience_unverified");
  if (input.duplicateReviewRequired) blockers.push("potential_duplicate_review_required");
  const unknownTerms = input.ingestUnknownTerms?.filter((term) => term !== "price" || !input.allowUnknownPrice) ?? [];
  if (input.country === "Unspecified" || unknownTerms.length > 0) {
    blockers.push("material_terms_unverified");
  }

  const applicationUrl = input.applicationUrl?.trim() ?? "";
  if (!applicationUrl) {
    blockers.push("application_url_missing");
  } else if (!isValidHttpUrl(applicationUrl)) {
    blockers.push("application_url_invalid");
  } else if (input.sourceUrl && canonicalUrl(applicationUrl) === canonicalUrl(input.sourceUrl)) {
    blockers.push("application_url_matches_source");
  }

  if (!input.applicationDeadline) {
    blockers.push("deadline_missing");
  } else if (Number.isNaN(input.applicationDeadline.getTime())) {
    blockers.push("deadline_invalid");
  } else if (input.applicationDeadline <= now) {
    blockers.push("deadline_expired");
  }

  if (input.moderationStatus !== "APPROVED") blockers.push("moderation_not_approved");
  if (!["telegram", "telegram_forward"].includes(input.sourceType?.toLowerCase() ?? "")
    || !input.media.some((item) => isOriginalTelegramPostMedia(input.sourceUrl, item))) {
    blockers.push("approved_media_missing");
  }

  const risks = contentRisks(input);

  return { publishAllowed: blockers.length === 0 && risks.length === 0, blockers, risks };
}
