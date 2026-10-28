"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { BookmarkPlus, Check, Loader2 } from "lucide-react";
import { createSavedSearch } from "@/app/actions/saved-search";
import { Button, Input } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

/**
 * Captures the current catalog filters from the URL and saves them as a named
 * search. Only the filter keys are stored — pagination/sort are ignored.
 */
const FILTER_KEYS = ["q", "category", "city", "format", "free"] as const;

export function SaveSearchButton({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const d = getDictionary(locale);
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const filters: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = params.get(k);
    if (v) filters[k] = v;
  }

  const hasFilters = Object.keys(filters).length > 0;
  const defaultName = filters.q || filters.category || filters.city || d.saved.defaultSearchName;

  function onSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    start(async () => {
      const res = await createSavedSearch(trimmed, filters);
      if (res?.error) setError(res.error);
      else {
        setSaved(true);
        setError(null);
        setNaming(false);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  if (!hasFilters) return null;

  if (naming) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={d.saved.promptName}
          autoFocus
          className="h-9 w-48"
        />
        <Button size="sm" type="submit" disabled={pending || !name.trim()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {d.saved.saveSearch}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setNaming(false)}>
          {d.common.cancel}
        </Button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setName(defaultName);
          setNaming(true);
        }}
        disabled={saved}
      >
        {saved ? <Check className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
        {saved ? d.common.saved : d.saved.saveSearch}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
