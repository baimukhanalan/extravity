"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { updateProfile, type OnboardingInput } from "@/app/actions/profile";
import { INTERESTS, SKILLS, GOALS, CITIES } from "@/lib/constants";
import { DEFAULT_LOCALE, getDictionary, interpolate, type Locale } from "@/lib/i18n";
import { Card, Button, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

function Chips({
  options, selected, onToggle,
}: { options: { key: string; label: string }[]; selected: string[]; onToggle: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = selected.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onToggle(o.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors cursor-pointer",
              active ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted hover:border-primary/40",
            )}
          >
            {active && <Check className="h-3.5 w-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ProfileEditor({ initial, locale = DEFAULT_LOCALE }: { initial: OnboardingInput; locale?: Locale }) {
  const d = getDictionary(locale);
  const [data, setData] = useState<OnboardingInput>(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(field: "interests" | "skills" | "goals", key: string) {
    setData((d) => {
      const arr = d[field] as string[];
      return { ...d, [field]: arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key] };
    });
  }

  function save() {
    startTransition(async () => {
      try {
        await updateProfile(data);
        setError(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      } catch {
        setError(d.common.actionError);
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="font-semibold">{d.profile.basicData}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="firstName">{d.profile.firstName}</Label><Input id="firstName" value={data.firstName} onChange={(e) => setData({ ...data, firstName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="lastName">{d.profile.lastName}</Label><Input id="lastName" value={data.lastName} onChange={(e) => setData({ ...data, lastName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="birthDate">{d.profile.birthDate}</Label><Input id="birthDate" type="date" value={data.birthDate || ""} onChange={(e) => setData({ ...data, birthDate: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="grade">{d.profile.grade}</Label>
            <Select id="grade" value={data.grade ?? ""} onChange={(e) => setData({ ...data, grade: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">—</option>
              {[7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>{interpolate(d.profile.gradeOption, { n: g })}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">{d.profile.city}</Label>
            <Select id="city" value={data.city || ""} onChange={(e) => setData({ ...data, city: e.target.value })}>
              <option value="">—</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="school">{d.profile.school}</Label><Input id="school" value={data.school || ""} onChange={(e) => setData({ ...data, school: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="phone">{d.profile.phone}</Label><Input id="phone" type="tel" value={data.phone || ""} onChange={(e) => setData({ ...data, phone: e.target.value })} placeholder="+7 700 000 00 00" /></div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">{d.profile.interests}</h2>
        <div className="mt-3"><Chips options={INTERESTS} selected={data.interests} onToggle={(k) => toggle("interests", k)} /></div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">{d.profile.skills}</h2>
        <div className="mt-3"><Chips options={SKILLS} selected={data.skills} onToggle={(k) => toggle("skills", k)} /></div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">{d.profile.goals}</h2>
        <div className="mt-3"><Chips options={GOALS} selected={data.goals} onToggle={(k) => toggle("goals", k)} /></div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">{d.profile.constraints}</h2>
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="maxBudget">{d.profile.maxBudget}</Label>
            <Input id="maxBudget" type="number" min={0} value={data.maxBudget ?? ""} onChange={(e) => setData({ ...data, maxBudget: e.target.value ? Number(e.target.value) : undefined })} placeholder={d.profile.maxBudgetPlaceholder} />
          </div>
          {[
            { key: "willingToTravel", label: d.profile.willingToTravel },
            { key: "onlineOnly", label: d.profile.onlineOnly },
            { key: "hasPassport", label: d.profile.hasPassport },
          ].map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
              <input type="checkbox" checked={data[c.key as keyof OnboardingInput] as boolean} onChange={(e) => setData({ ...data, [c.key]: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
              {c.label}
            </label>
          ))}
        </div>
      </Card>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3">
        {error && <span className="text-sm text-danger">{error}</span>}
        {saved && <span className="text-sm text-success">{d.profile.saved}</span>}
        <Button onClick={save} disabled={pending} size="lg">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {d.profile.saveProfile}
        </Button>
      </div>
    </div>
  );
}
