"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Star } from "lucide-react";
import { submitReview, type ReviewState } from "@/app/actions/reviews";
import { Card, Button, Select, Textarea, Label } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

const OUTCOME_VALUES = ["APPLIED", "ACCEPTED", "REJECTED", "WITHDREW"];

function SubmitBtn({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const d = getDictionary(locale);
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      {d.applications.save}
    </Button>
  );
}

export function ReviewForm({
  opportunityId,
  existing,
  locale = DEFAULT_LOCALE,
}: {
  opportunityId: string;
  existing?: { outcome: string; rating: number | null; comment: string | null; isPublic: boolean } | null;
  locale?: Locale;
}) {
  const d = getDictionary(locale);
  const outcomeLabels: Record<string, string> = {
    APPLIED: d.review.outcomeApplied,
    ACCEPTED: d.review.outcomeAccepted,
    REJECTED: d.review.outcomeRejected,
    WITHDREW: d.review.outcomeWithdrew,
  };
  const action = submitReview.bind(null, opportunityId);
  const [state, formAction] = useActionState<ReviewState, FormData>(
    async (_prev, fd) => action(fd),
    undefined,
  );

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Star className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">{d.review.title}</h3>
      </div>
      <p className="mt-1 text-xs text-muted">
        {d.review.hint}
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label>{d.review.outcomeLabel}</Label>
          <Select name="outcome" defaultValue={existing?.outcome ?? "APPLIED"}>
            {OUTCOME_VALUES.map((v) => <option key={v} value={v}>{outcomeLabels[v]}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{d.review.ratingLabel}</Label>
          <Select name="rating" defaultValue={existing?.rating ? String(existing.rating) : ""}>
            <option value="">—</option>
            {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{"★".repeat(r)}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{d.review.commentLabel}</Label>
          <Textarea name="comment" defaultValue={existing?.comment ?? ""} placeholder={d.review.commentPlaceholder} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublic" defaultChecked={existing?.isPublic ?? true} className="h-4 w-4 accent-[var(--primary)]" />
          {d.review.publicLabel}
        </label>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        {state?.success && <p className="flex items-center gap-1 text-sm text-success"><Check className="h-4 w-4" /> {d.review.saved}</p>}
        <div className="flex justify-end"><SubmitBtn locale={locale} /></div>
      </form>
    </Card>
  );
}
