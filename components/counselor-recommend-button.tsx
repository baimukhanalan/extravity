"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { recommendToStudent } from "@/app/actions/counselor";
import { Button } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export function RecommendButton({
  studentUserId,
  opportunityId,
  locale = DEFAULT_LOCALE,
}: {
  studentUserId: string;
  opportunityId: string;
  locale?: Locale;
}) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const d = getDictionary(locale).counsStudents;

  return (
    <Button
      size="sm"
      variant={sent ? "ghost" : "outline"}
      disabled={pending || sent}
      onClick={() =>
        start(async () => {
          const res = await recommendToStudent(studentUserId, opportunityId);
          if (res.ok) setSent(true);
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : sent ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
      {sent ? d.recommended : d.recommend}
    </Button>
  );
}
