"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Save } from "lucide-react";
import type { OrganizerFormState } from "@/app/actions/organizer";
import { Card, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { CITIES, ORGANIZER_TYPES } from "@/lib/constants";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export type OrganizerDefaults = {
  name?: string;
  type?: string | null;
  bin?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  description?: string | null;
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

export function OrganizerProfileForm({
  action,
  defaults = {},
  submitLabel,
  locale = DEFAULT_LOCALE,
}: {
  action: (prev: OrganizerFormState, formData: FormData) => Promise<OrganizerFormState>;
  defaults?: OrganizerDefaults;
  submitLabel: string;
  locale?: Locale;
}) {
  const [state, formAction] = useActionState<OrganizerFormState, FormData>(action, undefined);
  const d = getDictionary(locale);

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="org-name">{d.orgProfile.fieldName}</Label>
          <Input id="org-name" name="name" required defaultValue={defaults.name} placeholder="Astana Hub" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="org-type">{d.orgProfile.fieldType}</Label>
            <Select id="org-type" name="type" defaultValue={defaults.type ?? ""}>
              <option value="">—</option>
              {ORGANIZER_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-bin">{d.orgProfile.fieldBin}</Label>
            <Input id="org-bin" name="bin" defaultValue={defaults.bin ?? ""} placeholder="123456789012" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-website">{d.orgProfile.fieldWebsite}</Label>
            <Input id="org-website" name="website" type="url" defaultValue={defaults.website ?? ""} placeholder="https://example.kz" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-email">{d.orgProfile.fieldEmail}</Label>
            <Input id="org-email" name="email" type="email" defaultValue={defaults.email ?? ""} placeholder="info@example.kz" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-phone">{d.orgProfile.fieldPhone}</Label>
            <Input id="org-phone" name="phone" defaultValue={defaults.phone ?? ""} placeholder="+7 700 000 00 00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-city">{d.orgOpps.fieldCity}</Label>
            <Select id="org-city" name="city" defaultValue={defaults.city ?? ""}>
              <option value="">—</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="org-description">{d.orgProfile.fieldDescription}</Label>
          <Textarea
            id="org-description"
            name="description"
            defaultValue={defaults.description ?? ""}
            placeholder={d.orgProfile.phDescription}
          />
        </div>

        <p className="rounded-lg bg-surface-muted p-3 text-xs text-muted">
          {d.orgProfile.verificationHint}
        </p>

        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        {state?.success && (
          <p className="flex items-center gap-1 text-sm text-success"><Check className="h-4 w-4" /> {d.orgOpps.saved}</p>
        )}

        <div className="flex justify-end"><SubmitBtn label={submitLabel} /></div>
      </form>
    </Card>
  );
}
