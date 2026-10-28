import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "./i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const FREE_LABEL: Record<Locale, string> = { ru: "Бесплатно", kk: "Тегін", en: "Free" };

export function formatKzt(amount: number, locale: Locale = DEFAULT_LOCALE): string {
  if (amount === 0) return FREE_LABEL[locale] ?? FREE_LABEL.ru;
  return new Intl.NumberFormat(INTL_LOCALE[locale] ?? "ru-RU").format(amount) + " ₸";
}

export function formatOpportunityPrice(amount: number, currency: string, locale: Locale = DEFAULT_LOCALE): string {
  if (amount === 0) return FREE_LABEL[locale] ?? FREE_LABEL.ru;
  if (currency === "KZT") return formatKzt(amount, locale);
  try {
    return new Intl.NumberFormat(INTL_LOCALE[locale] ?? "ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat(INTL_LOCALE[locale] ?? "ru-RU").format(amount)} ${currency}`;
  }
}

export function formatDate(date: Date | string | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? "ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatDateShort(date: Date | string | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? "ru-RU", {
    day: "numeric",
    month: "short",
  }).format(d);
}

/** Category records carry all three names; pick the one for the active locale. */
export function categoryName(
  category: { name: string; nameRu: string; nameKz: string },
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (locale === "kk") return category.nameKz;
  if (locale === "en") return category.name;
  return category.nameRu;
}

/** Date offset from now — kept out of components so render stays pure. */
export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Whole years between a birth date and now. Null when no date. Lives here so
 *  components stay pure — calling Date.now() during render is flagged. */
export function calculateAge(birthDate: Date | string | null | undefined): number | null {
  if (!birthDate) return null;
  const d = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

/** Whole days from now until the given date. Negative if past. */
export function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function deadlineLabel(date: Date | string | null | undefined): {
  text: string;
  tone: "neutral" | "warning" | "danger" | "muted";
} {
  const days = daysUntil(date);
  if (days === null) return { text: "Без дедлайна", tone: "muted" };
  if (days < 0) return { text: "Дедлайн прошёл", tone: "muted" };
  if (days === 0) return { text: "Дедлайн сегодня", tone: "danger" };
  if (days === 1) return { text: "1 день до дедлайна", tone: "danger" };
  if (days <= 3) return { text: `${days} дня до дедлайна`, tone: "danger" };
  if (days <= 7) return { text: `${days} дней до дедлайна`, tone: "warning" };
  if (days <= 14) return { text: `${days} дней до дедлайна`, tone: "warning" };
  return { text: `${days} дней до дедлайна`, tone: "neutral" };
}

export function pluralize(n: number, forms: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}

/**
 * Kazakhstan runs on a single fixed offset (UTC+5, no DST) since March 2024,
 * so datetime-local values can be converted without a tz database.
 */
export const KZ_UTC_OFFSET_HOURS = 5;

/** "2026-08-06T10:00" (Almaty wall clock) → Date. */
export function parseKzDateTime(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value.length === 16 ? value : value.slice(0, 16)}:00+05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → "2026-08-06T10:00" in Almaty wall clock, for <input type="datetime-local">. */
export function toKzDateTimeInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + KZ_UTC_OFFSET_HOURS * 3600 * 1000).toISOString().slice(0, 16);
}

export function initials(first?: string | null, last?: string | null): string {
  return `${(first || "").charAt(0)}${(last || "").charAt(0)}`.toUpperCase() || "U";
}
