import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, getDictionary, isLocale, type Dict, type Locale } from "./i18n";

const COOKIE = "eckz_locale";

/**
 * Active UI locale. The cookie is the source of truth for rendering — it is
 * written on login and whenever the user changes the language, so public pages
 * localize without a database round-trip.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getT(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
