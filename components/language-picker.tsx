"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { switchLocale } from "@/app/actions/locale";
import { Select } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n";

export function LanguagePicker({ current, locale = DEFAULT_LOCALE }: { current: string; locale?: Locale }) {
  const d = getDictionary(locale);
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function onChange(v: string) {
    setValue(v);
    startTransition(async () => {
      await switchLocale(v);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-48" aria-label={d.portal.langSection}>
        {LOCALES.map((l) => (
          <option key={l} value={l}>{LOCALE_NAMES[l]}</option>
        ))}
      </Select>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
      {saved && (
        <span className="flex items-center gap-1 text-sm text-success">
          <Check className="h-4 w-4" /> {d.common.saved}
        </span>
      )}
    </div>
  );
}
