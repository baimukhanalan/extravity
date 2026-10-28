"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, BellOff, Trash2, Search, Loader2 } from "lucide-react";
import { deleteSavedSearch, toggleSavedSearchAlerts } from "@/app/actions/saved-search";
import { Card, Badge } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export type SavedSearchItem = {
  id: string;
  name: string;
  filters: Record<string, string>;
  alertsEnabled: boolean;
};

function toQuery(filters: Record<string, string>): string {
  const sp = new URLSearchParams(filters);
  return sp.toString();
}

export function SavedSearches({ items, locale = DEFAULT_LOCALE }: { items: SavedSearchItem[]; locale?: Locale }) {
  const d = getDictionary(locale);
  const [, start] = useTransition();
  const [busy, setBusy] = useState<{ id: string; action: "toggle" | "delete" } | null>(null);

  /** Human-readable summary of a saved search's filters. */
  function describe(filters: Record<string, string>): string {
    const parts: string[] = [];
    if (filters.q) parts.push(`«${filters.q}»`);
    if (filters.category) parts.push(filters.category);
    if (filters.city) parts.push(filters.city);
    if (filters.format) parts.push(filters.format === "ONLINE" ? d.saved.filterOnline : filters.format === "OFFLINE" ? d.saved.filterOffline : d.saved.filterHybrid);
    if (filters.free === "1") parts.push(d.saved.filterFree);
    return parts.length ? parts.join(" · ") : d.saved.filterAll;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted">
        {d.saved.noSearchesPrefix}<Link href="/app/discover" className="text-primary hover:underline">{d.saved.feedLink}</Link>{d.saved.noSearchesSuffix}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((s) => (
        <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <Link href={`/app/discover?${toQuery(s.filters)}`} className="min-w-0">
            <p className="flex items-center gap-2 font-medium hover:text-primary">
              <Search className="h-4 w-4 text-muted" /> {s.name}
            </p>
            <p className="mt-0.5 text-xs text-muted">{describe(s.filters)}</p>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setBusy({ id: s.id, action: "toggle" });
                start(async () => {
                  await toggleSavedSearchAlerts(s.id);
                  setBusy(null);
                });
              }}
              disabled={busy?.id === s.id}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
              title={s.alertsEnabled ? d.saved.alertsDisableTitle : d.saved.alertsEnableTitle}
            >
              {s.alertsEnabled ? (
                <Badge tone="success"><Bell className="h-3.5 w-3.5" /> {d.saved.alertsOn}</Badge>
              ) : (
                <Badge tone="muted"><BellOff className="h-3.5 w-3.5" /> {d.saved.alertsOff}</Badge>
              )}
            </button>
            <button
              onClick={() => {
                if (!window.confirm(d.confirm.delete)) return;
                setBusy({ id: s.id, action: "delete" });
                start(async () => {
                  await deleteSavedSearch(s.id);
                  setBusy(null);
                });
              }}
              disabled={busy?.id === s.id}
              className="text-muted hover:text-danger disabled:opacity-50"
              aria-label={d.cabinet.deleteAria}
            >
              {busy?.id === s.id && busy.action === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
