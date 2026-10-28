"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { respondToCounselorInvite } from "@/app/actions/counselor";
import { Button } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export function CounselorInviteResponse({ token, locale = DEFAULT_LOCALE }: { token: string; locale?: Locale }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  const router = useRouter();
  const d = getDictionary(locale).counsInvite;

  function respond(accept: boolean) {
    start(async () => {
      const res = await respondToCounselorInvite(token, accept);
      if (res.ok) {
        setDone(accept ? "accepted" : "declined");
        router.refresh();
      }
    });
  }

  if (done === "accepted") {
    return (
      <p className="flex items-center gap-2 text-sm text-success">
        <Check className="h-4 w-4" /> {d.acceptedMsg}
      </p>
    );
  }
  if (done === "declined") {
    return <p className="text-sm text-muted">{d.declinedMsg}</p>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button size="lg" disabled={pending} onClick={() => respond(true)}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {d.accept}
      </Button>
      <Button size="lg" variant="outline" disabled={pending} onClick={() => respond(false)}>
        <X className="h-4 w-4" /> {d.decline}
      </Button>
    </div>
  );
}
