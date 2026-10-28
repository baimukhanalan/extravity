"use client";

import { LayoutDashboard, ShieldCheck, CalendarClock } from "lucide-react";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";
import { PortalSidebar } from "@/components/portal-sidebar";

export function ParentSidebar({
  email,
  childrenCount,
  pendingConsents,
  locale = DEFAULT_LOCALE,
}: {
  email: string;
  childrenCount: number;
  pendingConsents: number;
  locale?: Locale;
}) {
  const d = getDictionary(locale).parentNav;
  return (
    <PortalSidebar
      brandHref="/parent"
      brandTitle={d.roleTitle}
      infoSlot={
        <div className="mx-3 mb-3 rounded-lg bg-surface-muted px-3 py-2">
          <p className="text-xs text-muted">{d.childrenOnPlatform}</p>
          <p className="text-sm font-medium">{childrenCount}</p>
        </div>
      }
      nav={[
        { href: "/parent", label: d.overview, icon: LayoutDashboard, exact: true },
        { href: "/parent/deadlines", label: d.deadlines, icon: CalendarClock },
        { href: "/parent/consents", label: d.consents, icon: ShieldCheck, badge: pendingConsents },
      ]}
      backHref="/catalog"
      backLabel={d.toCatalog}
      email={email}
      logoutLabel={d.logout}
      openLabel={d.openMenu}
      closeLabel={d.closeMenu}
      locale={locale}
    />
  );
}
