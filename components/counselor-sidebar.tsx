"use client";

import { LayoutDashboard, Users, UserCog } from "lucide-react";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";
import { PortalSidebar } from "@/components/portal-sidebar";

export function CounselorSidebar({
  name,
  email,
  school,
  pendingCount,
  locale = DEFAULT_LOCALE,
}: {
  name: string;
  email: string;
  school?: string | null;
  pendingCount: number;
  locale?: Locale;
}) {
  const d = getDictionary(locale).counsNav;
  return (
    <PortalSidebar
      brandHref="/counselor"
      brandTitle={d.brand}
      infoSlot={
        <div className="mx-3 mb-3 rounded-lg bg-surface-muted px-3 py-2">
          <p className="truncate text-sm font-medium">{name}</p>
          {school && <p className="truncate text-xs text-muted">{school}</p>}
        </div>
      }
      nav={[
        { href: "/counselor", label: d.overview, icon: LayoutDashboard, exact: true },
        { href: "/counselor/students", label: d.students, icon: Users, badge: pendingCount },
        { href: "/counselor/profile", label: d.profile, icon: UserCog },
      ]}
      backHref="/app"
      backLabel={d.toStudentPortal}
      email={email}
      logoutLabel={d.logout}
      openLabel={d.openMenu}
      closeLabel={d.closeMenu}
      locale={locale}
    />
  );
}
