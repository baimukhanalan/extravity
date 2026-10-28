"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, UserPlus } from "lucide-react";
import { inviteStudent, type CounselorFormState } from "@/app/actions/counselor";
import { Card, Button, Input, Label, Textarea } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

function SubmitBtn({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const { pending } = useFormStatus();
  const d = getDictionary(locale).counsInvite;
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
      {d.sendInvite}
    </Button>
  );
}

export function CounselorInviteForm({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const [state, formAction] = useActionState<CounselorFormState, FormData>(inviteStudent, undefined);
  const d = getDictionary(locale).counsInvite;

  return (
    <Card className="p-5">
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="studentEmail">{d.emailLabel}</Label>
          <Input id="studentEmail" name="studentEmail" type="email" required placeholder="student@example.kz" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note">{d.messageLabel}</Label>
          <Textarea id="note" name="note" className="min-h-20" placeholder={d.messagePlaceholder} />
        </div>
        <p className="rounded-lg bg-surface-muted p-3 text-xs text-muted">
          {d.formNote}
        </p>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        {state?.success && (
          <p className="flex items-center gap-1 text-sm text-success"><Check className="h-4 w-4" /> {d.sent}</p>
        )}
        <div className="flex justify-end"><SubmitBtn locale={locale} /></div>
      </form>
    </Card>
  );
}
