"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useId, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { Input, Select } from "@/components/ui";
import { CATEGORIES, CITIES } from "@/lib/constants";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";
import { categoryName } from "@/lib/utils";

export function CatalogFilters({
  showSort = true,
  locale = DEFAULT_LOCALE,
  horizontal = false,
}: {
  showSort?: boolean;
  locale?: Locale;
  horizontal?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = getDictionary(locale).catalog;
  const optionsId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Keep the input in sync when the URL changes from elsewhere (reset button,
  // back navigation) without an effect — adjust state during render instead.
  const urlQ = params.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [syncedQ, setSyncedQ] = useState(urlQ);
  if (urlQ !== syncedQ) {
    setSyncedQ(urlQ);
    setQ(urlQ);
  }

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    update("q", q.trim());
  }

  const sorts = [
    { value: "match", label: t.sortRelevance },
    { value: "deadline", label: t.sortDeadline },
    { value: "new", label: t.sortNew },
    { value: "prestige", label: t.sortPrestige },
    { value: "free", label: t.sortFree },
    { value: "success", label: t.sortSuccess },
  ];

  const activeFilterCount = ["category", "city", "format", "free", "availability"]
    .filter((key) => params.has(key)).length
    + (showSort && params.has("sort") && params.get("sort") !== "match" ? 1 : 0);
  const hasFilters = activeFilterCount > 0;

  return (
    <div className={horizontal ? "space-y-4" : "space-y-3"}>
      <form onSubmit={onSearch} role="search" className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t.searchPlaceholder}
          placeholder={t.searchPlaceholder}
          className={horizontal ? "h-14 rounded-xl border-[#cdd6df] bg-white pl-10 text-base shadow-sm" : "pl-9"}
        />
      </form>

      <button
        type="button"
        aria-controls={optionsId}
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((open) => !open)}
        className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-foreground lg:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          {t.filtersAndSort}
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
      </button>

      <div id={optionsId} className={`${filtersOpen ? "block" : "hidden"} space-y-3 lg:block`}>
        <div className={horizontal ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" : "grid grid-cols-2 gap-2 lg:grid-cols-1"}>
          <Select value={params.get("category") ?? ""} onChange={(e) => update("category", e.target.value)}>
            <option value="">{t.allCategories}</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>{categoryName(c, locale)}</option>
            ))}
          </Select>

          <Select value={params.get("city") ?? ""} onChange={(e) => update("city", e.target.value)}>
            <option value="">{t.allCities}</option>
            {CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>

          <Select value={params.get("format") ?? ""} onChange={(e) => update("format", e.target.value)}>
            <option value="">{t.anyFormat}</option>
            <option value="ONLINE">{t.formatOnline}</option>
            <option value="OFFLINE">{t.formatOffline}</option>
            <option value="HYBRID">{t.formatHybrid}</option>
          </Select>

          <Select value={params.get("free") ?? ""} onChange={(e) => update("free", e.target.value)}>
            <option value="">{t.priceAny}</option>
            <option value="1">{t.priceFree}</option>
          </Select>

          <Select className={horizontal ? "col-span-2 sm:col-span-1" : "col-span-2 lg:col-span-1"} value={params.get("availability") ?? "all"} onChange={(e) => update("availability", e.target.value === "all" ? "" : e.target.value)}>
            <option value="active">{t.availabilityActive}</option>
            <option value="all">{t.availabilityAll}</option>
            <option value="expired">{t.availabilityExpired}</option>
          </Select>

          {showSort && (
            <Select className={horizontal ? "col-span-2 sm:col-span-1" : "col-span-2 lg:col-span-1"} value={params.get("sort") ?? "match"} onChange={(e) => update("sort", e.target.value)}>
              {sorts.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          )}
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={() => router.push(pathname)}
            className="flex items-center gap-1 text-sm text-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> {t.reset}
          </button>
        )}
      </div>
    </div>
  );
}
