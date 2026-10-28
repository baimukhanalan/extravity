"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Link2, CheckCircle2, Loader2 } from "lucide-react";
import { submitFoundOpportunity, type SubmissionState } from "@/app/actions/opportunities";
import { Card, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { CATEGORIES } from "@/lib/constants";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
      {label}
    </Button>
  );
}

export function SubmitForm({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const [formKey, setFormKey] = useState(0);
  return <SubmitFormInner key={formKey} locale={locale} onReset={() => setFormKey((k) => k + 1)} />;
}

function SubmitFormInner({ locale, onReset }: { locale: Locale; onReset: () => void }) {
  const d = getDictionary(locale);
  const [state, formAction] = useActionState<SubmissionState, FormData>(submitFoundOpportunity, undefined);

  if (state?.success) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <h3 className="mt-3 font-semibold">{d.submit.successTitle}</h3>
        <p className="mt-1 text-sm text-muted">
          {d.submit.successBody}
        </p>
        <Button className="mt-4" variant="outline" onClick={onReset}>{d.submit.submitMore}</Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="url">{d.submit.fieldUrl}</Label>
          <Input id="url" name="url" type="url" placeholder="https://..." required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">{d.submit.fieldCategory}</Label>
          <Select id="category" name="category" defaultValue="">
            <option value="">{d.submit.categoryNone}</option>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.nameRu}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comment">{d.submit.fieldComment}</Label>
          <Textarea id="comment" name="comment" placeholder={d.submit.commentPlaceholder} />
        </div>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <div className="flex justify-end">
          <SubmitBtn label={d.submit.submitBtn} />
        </div>
      </form>
    </Card>
  );
}
