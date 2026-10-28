"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toggleSave } from "@/app/actions/opportunities";
import { cn } from "@/lib/utils";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export function SaveButton({
  opportunityId,
  initialSaved,
  variant = "icon",
  locale = DEFAULT_LOCALE,
}: {
  opportunityId: string;
  initialSaved: boolean;
  variant?: "icon" | "full";
  locale?: Locale;
}) {
  const d = getDictionary(locale);
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const res = await toggleSave(opportunityId);
      setSaved(res.saved);
    });
  }

  if (variant === "full") {
    return (
      <button
        onClick={onClick}
        disabled={pending}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer",
          saved ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface hover:bg-surface-muted",
        )}
      >
        {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        {saved ? d.common.saved : d.common.save}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      aria-label={saved ? d.saved.removeAria : d.common.save}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors disabled:opacity-50 cursor-pointer",
        saved ? "text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      {saved ? <BookmarkCheck className="h-4.5 w-4.5" /> : <Bookmark className="h-4.5 w-4.5" />}
    </button>
  );
}
