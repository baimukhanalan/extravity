"use client";

import { useEffect } from "react";
import Link from "next/link";
import { GraduationCap, Home, RotateCcw } from "lucide-react";
import { DEFAULT_LOCALE, getDictionary, interpolate, isLocale, type Locale } from "@/lib/i18n";

/** Resolve the active locale on the client from the cookie written on login. */
function resolveLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const value = document.cookie.match(/(?:^|;\s*)eckz_locale=([^;]+)/)?.[1];
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Route-segment error boundary. Catches render/data errors in a page and shows
 * a recoverable screen instead of a blank crash. The digest is logged so it can
 * be matched with the server-side Sentry event.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route error]", error.digest ?? error.message);
  }, [error]);

  const d = getDictionary(resolveLocale()).errorPage;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <Link href="/" className="mb-8 flex items-center gap-2 font-semibold">
        <GraduationCap className="h-6 w-6 text-primary" />
        Extravity
      </Link>
      <h1 className="text-2xl font-semibold">{d.title}</h1>
      <p className="mt-2 max-w-md text-muted">
        {d.description}
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-muted">{interpolate(d.errorCode, { digest: error.digest })}</p>
      )}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={reset}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <RotateCcw className="h-4 w-4" /> {d.tryAgain}
        </button>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface-muted"
        >
          <Home className="h-4 w-4" /> {d.toHome}
        </Link>
      </div>
    </div>
  );
}
