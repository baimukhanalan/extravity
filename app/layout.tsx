import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import { getLocale, getT } from "@/lib/locale";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const OG_LOCALE: Record<string, string> = { ru: "ru_RU", kk: "kk_KZ", en: "en_US" };

export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getT();
  return {
    metadataBase: new URL(appUrl),
    title: {
      default: t.seo.defaultTitle,
      template: "%s · Extravity",
    },
    description: t.seo.defaultDescription,
    keywords: [
      "внеклассные возможности",
      "олимпиады Казахстан",
      "хакатоны школьники",
      "поступление за рубеж",
      "extracurriculars",
    ],
    openGraph: {
      title: "Extravity",
      description: t.seo.ogDescription,
      type: "website",
      locale: OG_LOCALE[locale] ?? "ru_RU",
    },
    verification: process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : undefined,
  };
}

// Set theme before paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${geistSans.variable} h-full`} suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
