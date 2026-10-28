"use client";

import { useState, useTransition } from "react";
import { Globe, GlobeLock, Copy, Check, Loader2 } from "lucide-react";
import { togglePublicPortfolio } from "@/app/actions/portfolio";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";
import { Card, Button } from "@/components/ui";

/**
 * Public-portfolio control. Shows the shareable link when public, a copy button,
 * and a toggle. The parent renders this only when the flag is on.
 */
export function PortfolioShare({
  initialEnabled,
  initialSlug,
  appUrl,
  locale = DEFAULT_LOCALE,
}: {
  initialEnabled: boolean;
  initialSlug: string | null;
  appUrl: string;
  locale?: Locale;
}) {
  const d = getDictionary(locale);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [slug, setSlug] = useState(initialSlug);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = slug ? `${appUrl}/p/${slug}` : null;

  function toggle() {
    start(async () => {
      const res = await togglePublicPortfolio();
      if (res?.error) setError(res.error);
      else {
        setError(null);
        setEnabled(!!res?.enabled);
        if (res?.slug) setSlug(res.slug);
      }
    });
  }

  function copy() {
    if (!url) return;
    if (!navigator.clipboard) {
      setError(d.common.actionError);
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setError(null);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setError(d.common.actionError));
  }

  return (
    <Card className="p-5 print:hidden">
      <div className="flex items-center gap-2">
        {enabled ? <Globe className="h-5 w-5 text-primary" /> : <GlobeLock className="h-5 w-5 text-muted" />}
        <h2 className="font-semibold">{d.portfolio.shareTitle}</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        {enabled ? d.portfolio.shareEnabledDesc : d.portfolio.shareDisabledDesc}
      </p>

      {enabled && url && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="max-w-full break-all rounded-lg bg-surface-muted px-3 py-1.5 text-sm">{url}</code>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? d.portfolio.copied : d.portfolio.copy}
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-4">
        <Button size="sm" variant={enabled ? "outline" : "primary"} onClick={toggle} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {enabled ? d.portfolio.makePrivate : d.portfolio.publish}
        </Button>
      </div>
    </Card>
  );
}
