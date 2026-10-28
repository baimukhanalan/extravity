"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import type { ConsentType } from "@prisma/client";
import { submitParentConsent } from "@/app/actions/parent";
import { Button, Card } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, interpolate, type Locale } from "@/lib/i18n";

export function ParentConsentForm({
  token,
  studentName,
  types,
  alreadyDone,
  locale = DEFAULT_LOCALE,
}: {
  token: string;
  studentName: string;
  types: ConsentType[];
  alreadyDone: boolean;
  locale?: Locale;
}) {
  const d = getDictionary(locale).parentConsent;
  const LABELS: Record<ConsentType, { title: string; desc: string }> = {
    DATA_PROCESSING: { title: d.dataProcessingTitle, desc: d.dataProcessingDesc },
    DOCUMENT_STORAGE: { title: d.documentStorageTitle, desc: d.documentStorageDesc },
    DATA_SHARING: { title: d.dataSharingTitle, desc: d.dataSharingDesc },
    APPLICATION_SUBMIT: { title: d.applicationSubmitTitle, desc: d.applicationSubmitDesc },
  };
  const [checked, setChecked] = useState<Set<ConsentType>>(new Set(types));
  const [pending, start] = useTransition();
  const [done, setDone] = useState(alreadyDone);
  const [error, setError] = useState<string | null>(null);

  function toggle(t: ConsentType) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function submit() {
    setError(null);
    start(async () => {
      try {
        const res = await submitParentConsent(token, Array.from(checked));
        if (res.ok) setDone(true);
        else setError(getDictionary(locale).common.actionError);
      } catch {
        setError(getDictionary(locale).common.actionError);
      }
    });
  }

  if (done) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <h2 className="mt-4 text-xl font-semibold">{d.thanksTitle}</h2>
        <p className="mt-2 text-muted">{d.thanksBody}</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 text-primary">
        <ShieldCheck className="h-5 w-5" />
        <span className="text-sm font-medium">{d.pageTitle}</span>
      </div>
      <h1 className="mt-3 text-2xl font-semibold">{interpolate(d.inviteHeading, { studentName })}</h1>
      <p className="mt-2 text-sm text-muted">
        {d.chooseHint}
      </p>

      <div className="mt-5 space-y-2">
        {types.map((t) => (
          <label key={t} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 hover:bg-surface-muted">
            <input
              type="checkbox"
              checked={checked.has(t)}
              onChange={() => toggle(t)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              <span className="block text-sm font-medium">{LABELS[t].title}</span>
              <span className="block text-sm text-muted">{LABELS[t].desc}</span>
            </span>
          </label>
        ))}
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <Button onClick={submit} disabled={pending} size="lg" className="mt-5 w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {d.submitBtn}
      </Button>
    </Card>
  );
}
