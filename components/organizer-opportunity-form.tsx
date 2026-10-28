"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Save } from "lucide-react";
import type { OrganizerFormState } from "@/app/actions/organizer";
import { Card, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { CATEGORIES, CITIES } from "@/lib/constants";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export type OpportunityDefaults = {
  title?: string;
  shortDescription?: string;
  fullDescription?: string;
  categorySlug?: string;
  city?: string | null;
  venue?: string | null;
  format?: string;
  price?: number;
  minimumGrade?: number | null;
  maximumGrade?: number | null;
  applicationDeadline?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  applicationUrl?: string | null;
  sourceUrl?: string | null;
  requirements?: string[];
  prizes?: string | null;
  tags?: string[];
  certificatesAvailable?: boolean;
  financialAidAvailable?: boolean;
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

export function OrganizerOpportunityForm({
  action,
  defaults = {},
  submitLabel,
  locale = DEFAULT_LOCALE,
}: {
  action: (prev: OrganizerFormState, formData: FormData) => Promise<OrganizerFormState>;
  defaults?: OpportunityDefaults;
  submitLabel: string;
  locale?: Locale;
}) {
  const [state, formAction] = useActionState<OrganizerFormState, FormData>(action, undefined);
  const d = getDictionary(locale).orgOpps;

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="title">{d.fieldTitle}</Label>
          <Input id="title" name="title" required defaultValue={defaults.title} placeholder={d.phTitle} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="shortDescription">{d.fieldShortDesc}</Label>
          <Input
            id="shortDescription"
            name="shortDescription"
            required
            defaultValue={defaults.shortDescription}
            placeholder={d.phShortDesc}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fullDescription">{d.fieldFullDesc}</Label>
          <Textarea
            id="fullDescription"
            name="fullDescription"
            required
            className="min-h-40"
            defaultValue={defaults.fullDescription}
            placeholder={d.phFullDesc}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="categorySlug">{d.fieldCategory}</Label>
            <Select id="categorySlug" name="categorySlug" required defaultValue={defaults.categorySlug ?? ""}>
              <option value="" disabled>{d.optChoose}</option>
              {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.nameRu}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="format">{d.fieldFormat}</Label>
            <Select id="format" name="format" defaultValue={defaults.format ?? "OFFLINE"}>
              <option value="OFFLINE">{d.formatOffline}</option>
              <option value="ONLINE">{d.formatOnline}</option>
              <option value="HYBRID">{d.formatHybrid}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">{d.fieldCity}</Label>
            <Select id="city" name="city" defaultValue={defaults.city ?? ""}>
              <option value="">—</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="venue">{d.fieldVenue}</Label>
            <Input id="venue" name="venue" defaultValue={defaults.venue ?? ""} placeholder={d.phVenue} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price">{d.fieldPrice}</Label>
            <Input id="price" name="price" type="number" min={0} defaultValue={defaults.price ?? 0} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="applicationDeadline">{d.fieldDeadline}</Label>
            <Input id="applicationDeadline" name="applicationDeadline" type="datetime-local" defaultValue={defaults.applicationDeadline} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eventStartDate">{d.fieldEventStart}</Label>
            <Input id="eventStartDate" name="eventStartDate" type="datetime-local" defaultValue={defaults.eventStartDate} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eventEndDate">{d.fieldEventEnd}</Label>
            <Input id="eventEndDate" name="eventEndDate" type="datetime-local" defaultValue={defaults.eventEndDate} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="minimumGrade">{d.fieldGradeFrom}</Label>
            <Input id="minimumGrade" name="minimumGrade" type="number" min={1} max={12} defaultValue={defaults.minimumGrade ?? ""} placeholder="8" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maximumGrade">{d.fieldGradeTo}</Label>
            <Input id="maximumGrade" name="maximumGrade" type="number" min={1} max={12} defaultValue={defaults.maximumGrade ?? ""} placeholder="11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="applicationUrl">{d.fieldApplicationUrl}</Label>
            <Input id="applicationUrl" name="applicationUrl" type="url" defaultValue={defaults.applicationUrl ?? ""} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sourceUrl">{d.fieldSourceUrl}</Label>
            <Input id="sourceUrl" name="sourceUrl" type="url" defaultValue={defaults.sourceUrl ?? ""} placeholder="https://..." />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="requirements">{d.fieldRequirements}</Label>
          <Textarea
            id="requirements"
            name="requirements"
            defaultValue={(defaults.requirements ?? []).join("\n")}
            placeholder={d.phRequirements}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prizes">{d.fieldPrizes}</Label>
          <Textarea id="prizes" name="prizes" defaultValue={defaults.prizes ?? ""} placeholder={d.phPrizes} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tags">{d.fieldTags}</Label>
          <Input id="tags" name="tags" defaultValue={(defaults.tags ?? []).join(", ")} placeholder={d.phTags} />
        </div>

        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="certificatesAvailable"
              defaultChecked={defaults.certificatesAvailable}
              className="h-4 w-4 rounded border-border"
            />
            {d.certificates}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="financialAidAvailable"
              defaultChecked={defaults.financialAidAvailable}
              className="h-4 w-4 rounded border-border"
            />
            {d.financialAid}
          </label>
        </div>

        <p className="rounded-lg bg-surface-muted p-3 text-xs text-muted">
          {d.moderationNote}
        </p>

        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        {state?.success && (
          <p className="flex items-center gap-1 text-sm text-success"><Check className="h-4 w-4" /> {d.saved}</p>
        )}

        <div className="flex justify-end"><SubmitBtn label={submitLabel} /></div>
      </form>
    </Card>
  );
}
