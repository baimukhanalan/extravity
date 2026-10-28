import type { Locale } from "./i18n";

type CardFactInput = {
  title: string;
  shortDescription: string;
  fullDescription?: string | null;
  tags: string[];
  format: "ONLINE" | "OFFLINE" | "HYBRID";
  city?: string | null;
  minimumAge?: number | null;
  maximumAge?: number | null;
  minimumGrade?: number | null;
  maximumGrade?: number | null;
  applicationUrl?: string | null;
  sourceUrl?: string | null;
};

const copy = {
  ru: { online: "Онлайн", offline: "Офлайн", hybrid: "Гибрид", grades: "классы", years: "лет", audienceUnknown: "Аудитория уточняется", applyReady: "Ссылка подачи есть", applyMissing: "Ссылка уточняется" },
  kk: { online: "Онлайн", offline: "Офлайн", hybrid: "Аралас", grades: "сынып", years: "жас", audienceUnknown: "Аудитория нақтылануда", applyReady: "Өтінім сілтемесі бар", applyMissing: "Сілтеме нақтылануда" },
  en: { online: "Online", offline: "In person", hybrid: "Hybrid", grades: "grades", years: "years", audienceUnknown: "Audience to be confirmed", applyReady: "Application link available", applyMissing: "Application link to be confirmed" },
} as const;

const SOCIAL_APPLICATION_HOSTS = new Set([
  "instagram.com", "www.instagram.com", "t.me", "telegram.me", "wa.me", "whatsapp.com", "www.whatsapp.com",
]);

export function hasUsableApplicationUrl(value?: string | null, sourceUrl?: string | null): boolean {
  if (!value) return false;
  try {
    const application = new URL(value);
    if (application.protocol !== "https:" || SOCIAL_APPLICATION_HOSTS.has(application.hostname.toLowerCase())) return false;
    if (sourceUrl) {
      const source = new URL(sourceUrl);
      if (application.href === source.href) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function opportunityCardFacts(input: CardFactInput, locale: Locale) {
  const labels = copy[locale] ?? copy.ru;
  const haystack = `${input.title} ${input.shortDescription} ${input.fullDescription ?? ""} ${input.tags.join(" ")}`;
  const exams = [
    ["SAT", /\b(?:digital\s+)?sat\b/i],
    ["IELTS", /\bielts(?:\s+academic)?\b/i],
    ["TOEFL", /\btoefl(?:\s+ibt)?\b/i],
  ] as const;
  const exam = exams.filter(([, pattern]) => pattern.test(haystack)).map(([name]) => name).join(" + ") || null;

  let audience: string = labels.audienceUnknown;
  if (input.minimumGrade !== null && input.minimumGrade !== undefined) {
    const range = input.maximumGrade && input.maximumGrade !== input.minimumGrade
      ? `${input.minimumGrade}–${input.maximumGrade}`
      : String(input.minimumGrade);
    audience = `${range} ${labels.grades}`;
  } else if (input.minimumAge !== null && input.minimumAge !== undefined) {
    const range = input.maximumAge && input.maximumAge !== input.minimumAge
      ? `${input.minimumAge}–${input.maximumAge}`
      : `${input.minimumAge}+`;
    audience = `${range} ${labels.years}`;
  }

  const format = input.format === "ONLINE"
    ? labels.online
    : input.format === "HYBRID"
      ? `${labels.hybrid}${input.city ? ` · ${input.city}` : ""}`
      : input.city ?? labels.offline;
  const applicationReady = hasUsableApplicationUrl(input.applicationUrl, input.sourceUrl);

  return {
    exam,
    audience,
    format,
    applicationReady,
    application: applicationReady ? labels.applyReady : labels.applyMissing,
  };
}
