"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, UserPlus, CheckCircle2, Clock } from "lucide-react";
import { inviteParent, type ParentInviteState } from "@/app/actions/parent";
import { Button, Input, Label, Badge } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

type Link = {
  id: string;
  parentEmail: string;
  status: string;
  consents: { type: string; granted: boolean }[];
};

function SubmitBtn({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const d = getDictionary(locale);
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
      {d.parentInvite.invite}
    </Button>
  );
}

export function ParentInvite({ links, locale = DEFAULT_LOCALE }: { links: Link[]; locale?: Locale }) {
  const d = getDictionary(locale);
  const consentLabel: Record<string, string> = {
    DATA_PROCESSING: d.parentInvite.consentDataProcessing,
    DOCUMENT_STORAGE: d.parentInvite.consentDocumentStorage,
    DATA_SHARING: d.parentInvite.consentDataSharing,
    APPLICATION_SUBMIT: d.parentInvite.consentApplicationSubmit,
  };
  const [state, formAction] = useActionState<ParentInviteState, FormData>(inviteParent, undefined);

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="pi-parentEmail">{d.parentInvite.parentEmailLabel}</Label>
          <Input id="pi-parentEmail" name="parentEmail" type="email" placeholder="parent@example.com" required />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="pi-parentName">{d.parentInvite.parentNameLabel}</Label>
          <Input id="pi-parentName" name="parentName" placeholder={d.parentInvite.parentNamePlaceholder} />
        </div>
        <SubmitBtn locale={locale} />
      </form>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.success && <p className="text-sm text-success">{d.parentInvite.inviteSent}</p>}

      {links.length > 0 && (
        <div className="space-y-2">
          {links.map((l) => (
            <div key={l.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{l.parentEmail}</span>
                <Badge tone={l.status === "active" ? "success" : "warning"}>
                  {l.status === "active" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                  {l.status === "active" ? d.parentInvite.statusConfirmed : d.parentInvite.statusPending}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {l.consents.map((c) => (
                  <Badge key={c.type} tone={c.granted ? "success" : "muted"}>
                    {consentLabel[c.type] ?? c.type}: {c.granted ? d.parentInvite.consentYes : d.parentInvite.consentNo}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
