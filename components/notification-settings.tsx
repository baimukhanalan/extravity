"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Send, Unlink } from "lucide-react";
import { updateNotificationPreferences, disconnectTelegram } from "@/app/actions/profile";
import { Badge, Button, Label, Select } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export type NotificationPrefs = {
  inApp: boolean;
  email: boolean;
  telegram: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function NotificationSettings({
  prefs,
  telegramLinked,
  telegramBotUrl,
  locale = DEFAULT_LOCALE,
}: {
  prefs: NotificationPrefs;
  telegramLinked: boolean;
  /** Deep link that pre-fills the /start token; null when the bot isn't configured. */
  telegramBotUrl: string | null;
  locale?: Locale;
}) {
  const d = getDictionary(locale);
  const [value, setValue] = useState<NotificationPrefs>(prefs);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  function update(patch: Partial<NotificationPrefs>) {
    const next = { ...value, ...patch };
    setValue(next);
    start(async () => {
      await updateNotificationPreferences(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  const channels: { key: "inApp" | "email" | "telegram"; label: string; hint?: string }[] = [
    { key: "inApp", label: d.notifications.channelInApp },
    { key: "email", label: "Email" },
    { key: "telegram", label: "Telegram", hint: telegramLinked ? undefined : d.notifications.telegramNeedLink },
  ];

  return (
    <div className="space-y-3">
      {channels.map((c) => (
        <label
          key={c.key}
          className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm"
        >
          <span>
            {c.label}
            {c.hint && <span className="ml-2 text-xs text-muted">({c.hint})</span>}
          </span>
          <input
            type="checkbox"
            checked={value[c.key]}
            disabled={pending || (c.key === "telegram" && !telegramLinked)}
            onChange={(e) => update({ [c.key]: e.target.checked } as Partial<NotificationPrefs>)}
            className="h-4 w-4 accent-[var(--primary)]"
          />
        </label>
      ))}

      <div className="rounded-lg border border-border px-3 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm">{d.notifications.telegramBot}</span>
          {telegramLinked ? <Badge tone="success">{d.notifications.linked}</Badge> : <Badge tone="muted">{d.notifications.notLinked}</Badge>}
        </div>
        <div className="mt-3">
          {telegramLinked ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => disconnectTelegram())}>
              <Unlink className="h-4 w-4" /> {d.notifications.unlink}
            </Button>
          ) : telegramBotUrl ? (
            <a
              href={telegramBotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-surface-muted"
            >
              <Send className="h-4 w-4" /> {d.notifications.openBot}
            </a>
          ) : (
            <p className="text-xs text-muted">{d.notifications.botHint}</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border px-3 py-3">
        <Label>{d.notifications.quietHours}</Label>
        <p className="mt-1 text-xs text-muted">{d.notifications.quietHoursHint}</p>
        <div className="mt-3 flex items-center gap-2">
          <Select
            value={value.quietHoursStart ?? ""}
            disabled={pending}
            onChange={(e) => update({ quietHoursStart: e.target.value === "" ? null : Number(e.target.value) })}
            className="h-9 max-w-28"
          >
            <option value="">—</option>
            {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
          </Select>
          <span className="text-sm text-muted">{d.notifications.until}</span>
          <Select
            value={value.quietHoursEnd ?? ""}
            disabled={pending}
            onChange={(e) => update({ quietHoursEnd: e.target.value === "" ? null : Number(e.target.value) })}
            className="h-9 max-w-28"
          >
            <option value="">—</option>
            {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
          </Select>
          {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
          {saved && !pending && (
            <span className="flex items-center gap-1 text-sm text-success"><Check className="h-4 w-4" /> {d.common.saved}</span>
          )}
        </div>
      </div>
    </div>
  );
}
