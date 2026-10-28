"use client";

import { useTransition } from "react";
import { Languages } from "lucide-react";
import { switchLocale } from "@/app/actions/locale";
import { LOCALES, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SHORT: Record<Locale, string> = { ru: "RU", kk: "KZ", en: "EN" };

/** Compact three-way switch for the site header. */
export function LocaleSwitch({ current, className }: { current: Locale; className?: string }) {
  const [pending, start] = useTransition();

  return (
    <div className={cn("flex items-center gap-0.5 rounded-lg border border-border p-0.5", className)}>
      <Languages className="ml-1 h-3.5 w-3.5 text-muted" aria-hidden />
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending || l === current}
          onClick={() => start(() => switchLocale(l))}
          aria-current={l === current}
          className={cn(
            "rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
            l === current ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground",
            pending && "opacity-60",
          )}
        >
          {SHORT[l]}
        </button>
      ))}
    </div>
  );
}
