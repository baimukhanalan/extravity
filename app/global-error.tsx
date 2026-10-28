"use client";

import { useEffect } from "react";
import { DEFAULT_LOCALE, getDictionary, isLocale, type Locale } from "@/lib/i18n";

/** Resolve the active locale on the client from the cookie written on login. */
function resolveLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const value = document.cookie.match(/(?:^|;\s*)eckz_locale=([^;]+)/)?.[1];
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Last-resort boundary for errors thrown in the root layout itself. It must
 * render its own <html>/<body> because the normal layout has already failed.
 * Kept deliberately minimal and dependency-free.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error.digest ?? error.message);
  }, [error]);

  const locale = resolveLocale();
  const d = getDictionary(locale).errorPage;

  return (
    <html lang={locale}>
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "1rem",
          background: "#f7f8fa",
          color: "#111827",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>{d.globalTitle}</h1>
        <p style={{ marginTop: "0.5rem", color: "#6b7280", maxWidth: "28rem" }}>
          {d.globalDescription}
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: "1.5rem",
            padding: "0.625rem 1.25rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {d.globalReload}
        </button>
      </body>
    </html>
  );
}
