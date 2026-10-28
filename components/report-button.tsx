"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Flag, Loader2, CheckCircle2 } from "lucide-react";
import { reportOpportunity, type ReportState } from "@/app/actions/complaints";
import { Button, Select, Textarea } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {label}
    </Button>
  );
}

export function ReportButton({ opportunityId, locale = DEFAULT_LOCALE }: { opportunityId: string; locale?: Locale }) {
  const d = getDictionary(locale);
  const REASONS = [
    d.cabinet.reportReasonSuspicious,
    d.cabinet.reportReasonWrongData,
    d.cabinet.reportReasonScam,
    d.cabinet.reportReasonStaleDeadline,
    d.cabinet.reportReasonOther,
  ];
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ReportState, FormData>(reportOpportunity, undefined);

  if (state?.success) {
    return (
      <p className="flex items-center justify-center gap-1.5 text-sm text-success">
        <CheckCircle2 className="h-4 w-4" /> {d.cabinet.reportSent}
      </p>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-full text-muted hover:text-danger"
      >
        <Flag className="h-3.5 w-3.5" /> {d.cabinet.reportOpen}
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-border p-3">
      <input type="hidden" name="targetId" value={opportunityId} />
      <Select name="reason" defaultValue={REASONS[0]} className="h-9 text-sm">
        {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </Select>
      <Textarea name="details" placeholder={d.cabinet.reportDetailsPlaceholder} className="min-h-16 text-sm" />
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{d.common.cancel}</Button>
        <SubmitBtn label={d.cabinet.reportSubmit} />
      </div>
    </form>
  );
}
