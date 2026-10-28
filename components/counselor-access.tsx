"use client";

import { useTransition } from "react";
import { Loader2, UserMinus } from "lucide-react";
import { leaveCounselor } from "@/app/actions/counselor";
import { Badge, Button } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export type CounselorAccessLink = {
  id: string;
  status: string;
  counselorName: string;
  school: string | null;
};

function RevokeAccessButton({ id, label, confirmText }: { id: string; label: string; confirmText: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm(confirmText)) return;
        start(() => leaveCounselor(id));
      }}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
      {label}
    </Button>
  );
}

export function CounselorAccess({ links, locale = DEFAULT_LOCALE }: { links: CounselorAccessLink[]; locale?: Locale }) {
  const d = getDictionary(locale);

  if (links.length === 0) {
    return <p className="text-sm text-muted">{d.counselorAccess.emptyState}</p>;
  }

  return (
    <div className="space-y-2">
      {links.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">{l.counselorName}</p>
            {l.school && <p className="text-xs text-muted">{l.school}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={l.status === "active" ? "success" : "warning"}>
              {l.status === "active" ? d.counselorAccess.hasAccess : d.counselorAccess.pendingResponse}
            </Badge>
            <RevokeAccessButton id={l.id} label={d.counselorAccess.revoke} confirmText={d.confirm.revoke} />
          </div>
        </div>
      ))}
    </div>
  );
}
