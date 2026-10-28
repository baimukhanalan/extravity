"use client";

import { useTransition } from "react";
import { Loader2, UserMinus } from "lucide-react";
import type { ConsentType } from "@prisma/client";
import { setConsent, revokeParentLink } from "@/app/actions/parent";
import { Card, Badge, Button } from "@/components/ui";
import { CONSENT_LABELS } from "@/lib/constants";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export type ParentConsentGroup = {
  linkId: string;
  childName: string;
  status: string;
  consents: { type: ConsentType; granted: boolean }[];
};

export function ParentConsentManager({
  groups,
  locale = DEFAULT_LOCALE,
}: {
  groups: ParentConsentGroup[];
  locale?: Locale;
}) {
  const d = getDictionary(locale).parentConsents;
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.linkId} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">{g.childName}</p>
              <p className="text-xs text-muted">
                {g.status === "active" ? d.linkActive : d.linkPending}
              </p>
            </div>
            {g.status !== "revoked" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (!confirm(getDictionary(locale).confirm.revoke)) return;
                  start(() => revokeParentLink(g.linkId).then(() => undefined));
                }}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                {d.revokeLink}
              </Button>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {g.consents.map((c) => {
              const meta = CONSENT_LABELS[c.type] ?? { title: c.type, description: "" };
              return (
                <label
                  key={c.type}
                  className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border px-3 py-3"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{meta.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{meta.description}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={c.granted ? "success" : "muted"}>{c.granted ? d.granted : d.notGranted}</Badge>
                    <input
                      type="checkbox"
                      checked={c.granted}
                      disabled={pending}
                      onChange={(e) =>
                        start(async () => {
                          await setConsent(g.linkId, c.type, e.target.checked);
                        })
                      }
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                  </span>
                </label>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
