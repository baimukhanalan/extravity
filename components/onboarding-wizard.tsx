"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { completeOnboarding, type OnboardingInput } from "@/app/actions/profile";
import { INTERESTS, SKILLS, GOALS, CITIES } from "@/lib/constants";
import { DEFAULT_LOCALE, getDictionary, interpolate, type Locale } from "@/lib/i18n";
import { Button, Input, Label, Select, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

function Chips({
  options,
  selected,
  onToggle,
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
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
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors cursor-pointer",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface text-muted hover:border-primary/40",
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

export function OnboardingWizard({ firstName, lastName, locale = DEFAULT_LOCALE, next = null }: { firstName: string; lastName: string; locale?: Locale; next?: string | null }) {
  const d = getDictionary(locale);
  const STEPS = [d.onboarding.stepBasic, d.profile.interests, d.profile.skills, d.profile.goals, d.profile.constraints];
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<OnboardingInput>({
    firstName,
    lastName,
    birthDate: "",
    city: "",
    school: "",
    grade: undefined,
    phone: "",
    interests: [],
    skills: [],
    goals: [],
    maxBudget: undefined,
    willingToTravel: false,
    onlineOnly: false,
    hasPassport: false,
    preferredLanguages: [],
  });

  function toggle(field: "interests" | "skills" | "goals" | "preferredLanguages", key: string) {
    setData((d) => {
      const arr = d[field] as string[];
      return { ...d, [field]: arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key] };
    });
  }

  const canNext = step === 0 ? data.firstName.trim() && data.lastName.trim() : true;

  function submit() {
    startTransition(async () => {
      await completeOnboarding(data, next);
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Stepper */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < step ? "bg-success text-white" : i === step ? "bg-primary text-white" : "bg-surface-muted text-muted",
              )}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={cn("h-0.5 flex-1", i < step ? "bg-success" : "bg-border")} />}
          </div>
        ))}
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">{STEPS[step]}</h2>

        {step === 0 && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">{d.profile.firstName}</Label>
                <Input id="firstName" value={data.firstName} onChange={(e) => setData({ ...data, firstName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">{d.profile.lastName}</Label>
                <Input id="lastName" value={data.lastName} onChange={(e) => setData({ ...data, lastName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="birthDate">{d.profile.birthDate}</Label>
                <Input id="birthDate" type="date" value={data.birthDate} onChange={(e) => setData({ ...data, birthDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grade">{d.profile.grade}</Label>
                <Select
                  id="grade"
                  value={data.grade ?? ""}
                  onChange={(e) => setData({ ...data, grade: e.target.value ? Number(e.target.value) : undefined })}
                >
                  <option value="">{d.onboarding.selectGrade}</option>
                  {[7, 8, 9, 10, 11, 12].map((g) => (
                    <option key={g} value={g}>{interpolate(d.profile.gradeOption, { n: g })}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="city">{d.profile.city}</Label>
                <Select id="city" value={data.city} onChange={(e) => setData({ ...data, city: e.target.value })}>
                  <option value="">{d.onboarding.selectCity}</option>
                  {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="school">{d.profile.school}</Label>
                <Input id="school" value={data.school} onChange={(e) => setData({ ...data, school: e.target.value })} placeholder={d.onboarding.schoolPlaceholder} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">{d.profile.phone}</Label>
                <Input id="phone" type="tel" value={data.phone || ""} onChange={(e) => setData({ ...data, phone: e.target.value })} placeholder="+7 700 000 00 00" />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted">{d.onboarding.interestsHint}</p>
            <Chips options={INTERESTS} selected={data.interests} onToggle={(k) => toggle("interests", k)} />
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted">{d.onboarding.skillsHint}</p>
            <Chips options={SKILLS} selected={data.skills} onToggle={(k) => toggle("skills", k)} />
          </div>
        )}

        {step === 3 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted">{d.onboarding.goalsHint}</p>
            <Chips options={GOALS} selected={data.goals} onToggle={(k) => toggle("goals", k)} />
          </div>
        )}

        {step === 4 && (
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="maxBudget">{d.onboarding.maxBudget}</Label>
              <Input
                id="maxBudget"
                type="number"
                min={0}
                value={data.maxBudget ?? ""}
                onChange={(e) => setData({ ...data, maxBudget: e.target.value ? Number(e.target.value) : undefined })}
                placeholder={d.onboarding.maxBudgetPlaceholder}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{d.onboarding.preferredLanguages}</Label>
              <Chips
                options={[{ key: "ru", label: "Русский" }, { key: "kk", label: "Қазақша" }, { key: "en", label: "English" }]}
                selected={data.preferredLanguages}
                onToggle={(k) => toggle("preferredLanguages", k)}
              />
            </div>
            <div className="space-y-2">
              {[
                { key: "willingToTravel", label: d.onboarding.willingToTravel },
                { key: "onlineOnly", label: d.onboarding.onlineOnly },
                { key: "hasPassport", label: d.profile.hasPassport },
              ].map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={data[c.key as keyof OnboardingInput] as boolean}
                    onChange={(e) => setData({ ...data, [c.key]: e.target.checked })}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ArrowLeft className="h-4 w-4" /> {d.onboarding.back}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              {d.onboarding.next} <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {d.onboarding.finish}
            </Button>
          )}
        </div>
      </Card>

      <button
        onClick={submit}
        disabled={pending}
        className="mx-auto mt-4 block text-sm text-muted hover:text-foreground"
      >
        {d.onboarding.skip}
      </button>
    </div>
  );
}
