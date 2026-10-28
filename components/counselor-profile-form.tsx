"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Save } from "lucide-react";
import type { CounselorFormState } from "@/app/actions/counselor";
import { Card, Button, Input, Label, Select } from "@/components/ui";
import { CITIES } from "@/lib/constants";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export type CounselorDefaults = {
  fullName?: string;
  school?: string | null;
  city?: string | null;
  position?: string | null;
};

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {label}
    </Button>
  );
}

export function CounselorProfileForm({
  action,
  defaults = {},
  submitLabel,
  locale = DEFAULT_LOCALE,
}: {
  action: (prev: CounselorFormState, formData: FormData) => Promise<CounselorFormState>;
  defaults?: CounselorDefaults;
  submitLabel: string;
  locale?: Locale;
}) {
  const [state, formAction] = useActionState<CounselorFormState, FormData>(action, undefined);
  const d = getDictionary(locale).counsProfile;

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="cp-fullName">{d.fullNameLabel}</Label>
          <Input id="cp-fullName" name="fullName" required defaultValue={defaults.fullName} placeholder={d.fullNamePlaceholder} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cp-school">{d.schoolLabel}</Label>
            <Input id="cp-school" name="school" defaultValue={defaults.school ?? ""} placeholder={d.schoolPlaceholder} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-position">{d.positionLabel}</Label>
            <Input id="cp-position" name="position" defaultValue={defaults.position ?? ""} placeholder={d.positionPlaceholder} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-city">{d.cityLabel}</Label>
            <Select id="cp-city" name="city" defaultValue={defaults.city ?? ""}>
              <option value="">—</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        </div>

        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        {state?.success && (
          <p className="flex items-center gap-1 text-sm text-success"><Check className="h-4 w-4" /> {d.saved}</p>
        )}

        <div className="flex justify-end"><SubmitBtn label={submitLabel} /></div>
      </form>
    </Card>
  );
}
