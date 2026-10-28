"use client";

import { useTransition } from "react";
import { Loader2, UserMinus } from "lucide-react";
import { revokeStudentLink } from "@/app/actions/counselor";
import { Button } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export function RevokeLinkButton({
  linkId,
  label,
  locale = DEFAULT_LOCALE,
}: {
  linkId: string;
  label?: string;
  locale?: Locale;
}) {
  const [pending, start] = useTransition();
  const text = label ?? getDictionary(locale).counsStudents.revoke;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm(getDictionary(locale).confirm.revoke)) return;
        start(() => revokeStudentLink(linkId));
      }}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
      {text}
    </Button>
  );
}
