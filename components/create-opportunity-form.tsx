"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Plus } from "lucide-react";
import { createOpportunity, type AdminFormState } from "@/app/actions/admin";
import { Card, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { CATEGORIES, CITIES } from "@/lib/constants";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

function SubmitBtn({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const { pending } = useFormStatus();
  const d = getDictionary(locale).adminOpps;
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {d.submitCreate}
    </Button>
  );
}

export function CreateOpportunityForm({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(createOpportunity, undefined);
  const d = getDictionary(locale).adminOpps;

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">{d.fieldTitle}</Label>
          <Input id="title" name="title" required placeholder={d.phTitle} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shortDescription">{d.fieldShortDesc}</Label>
          <Input id="shortDescription" name="shortDescription" required placeholder={d.phShortDesc} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fullDescription">{d.fieldFullDesc}</Label>
          <Textarea id="fullDescription" name="fullDescription" required placeholder={d.phFullDesc} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="categorySlug">{d.fieldCategory}</Label>
            <Select id="categorySlug" name="categorySlug" required defaultValue="">
              <option value="" disabled>{d.optChoose}</option>
              {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.nameRu}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="organizerName">{d.fieldOrganizer}</Label>
            <Input id="organizerName" name="organizerName" required placeholder="Astana Hub" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">{d.fieldCity}</Label>
            <Select id="city" name="city" defaultValue="">
              <option value="">—</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="format">{d.fieldFormat}</Label>
            <Select id="format" name="format" defaultValue="OFFLINE">
              <option value="OFFLINE">{d.formatOffline}</option>
              <option value="ONLINE">{d.formatOnline}</option>
              <option value="HYBRID">{d.formatHybrid}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price">{d.fieldPrice}</Label>
            <Input id="price" name="price" type="number" min={0} defaultValue={0} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="applicationDeadline">{d.fieldDeadline}</Label>
            <Input id="applicationDeadline" name="applicationDeadline" type="datetime-local" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="minimumGrade">{d.fieldGradeFrom}</Label>
            <Input id="minimumGrade" name="minimumGrade" type="number" min={1} max={12} placeholder="8" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maximumGrade">{d.fieldGradeTo}</Label>
            <Input id="maximumGrade" name="maximumGrade" type="number" min={1} max={12} placeholder="11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trustScore">Trust score (0–100)</Label>
            <Input id="trustScore" name="trustScore" type="number" min={0} max={100} defaultValue={70} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prestigeScore">Prestige score (0–100)</Label>
            <Input id="prestigeScore" name="prestigeScore" type="number" min={0} max={100} defaultValue={55} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">{d.status}</Label>
            <Select id="status" name="status" defaultValue="PUBLISHED">
              <option value="PUBLISHED">Published</option>
              <option value="REGISTRATION_OPEN">Registration open</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_REVIEW">Pending review</option>
            </Select>
          </div>
        </div>

        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <div className="flex justify-end"><SubmitBtn locale={locale} /></div>
      </form>
    </Card>
  );
}
