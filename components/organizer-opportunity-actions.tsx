"use client";

import { useState, useTransition } from "react";
import { Archive, Loader2, Lock, Unlock } from "lucide-react";
import { setOrganizerOpportunityStatus } from "@/app/actions/organizer";
import { Button } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export function OrganizerOpportunityActions({
  id,
  status,
  canReopen,
  locale = DEFAULT_LOCALE,
}: {
  id: string;
  status: string;
  canReopen: boolean;
  locale?: Locale;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const dict = getDictionary(locale);
  const d = dict.orgOpps;
  const closed = ["CLOSED", "ARCHIVED", "COMPLETED"].includes(status);

  function run(next: "CLOSED" | "ARCHIVED" | "REGISTRATION_OPEN") {
    setError(false);
    startTransition(async () => {
      try {
        await setOrganizerOpportunityStatus(id, next);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {pending && <Loader2 className="h-4 w-4 animate-spin self-center text-muted" />}
      {!closed && (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run("CLOSED")}>
          <Lock className="h-4 w-4" /> {d.closeRegistration}
        </Button>
      )}
      {closed && canReopen && (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run("REGISTRATION_OPEN")}>
          <Unlock className="h-4 w-4" /> {d.openRegistration}
        </Button>
      )}
      {status !== "ARCHIVED" && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => { if (window.confirm(dict.confirm.archive)) run("ARCHIVED"); }}
        >
          <Archive className="h-4 w-4" /> {d.archive}
        </Button>
      )}
      {error && <p className="w-full text-sm text-danger">{dict.common.actionError}</p>}
    </div>
  );
}
