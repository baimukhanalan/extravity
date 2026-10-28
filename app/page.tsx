import { Landing } from "@/components/landing/landing";
import { getCatalog } from "@/lib/queries";
import "./landing.css";

/**
 * Landing page — ported 1:1 from the Claude design
 * ("Extravity Landing.dc.html") and wired to real routes/data:
 *  - "Создать профиль" → /signup, "Войти" → /login, "Смотреть каталог" → /catalog,
 *    footer links → /for-*, /contact, /privacy, /terms.
 *  - RU/KZ/EN also sets the app's `eckz_locale` cookie (see components/landing/init.ts).
 *  - The "N возможностей открыто сейчас" line shows the live approved-opportunity count.
 * Markup is injected verbatim; the design's script runs client-side after
 * hydration (components/landing). Fonts are allowed in proxy.ts CSP; landing.css
 * is route-scoped.
 */
async function getOpportunityCount(): Promise<number | null> {
  try {
    return (await getCatalog({})).total;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const oppCount = await getOpportunityCount();
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* Intentionally page-scoped: these display fonts are only needed on the landing. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Prata&display=swap"
      />
      <Landing oppCount={oppCount} />
    </>
  );
}
