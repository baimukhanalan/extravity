"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, LogOut, Menu, X, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/app/actions/auth";
import { type Locale } from "@/lib/i18n";

export type PortalNavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  /** Optional count badge; rendered only when > 0. */
  badge?: number;
};

/**
 * Shared collapsible portal sidebar (mobile drawer + desktop rail) used by the
 * counsellor and parent portals, which were previously ~95% duplicated. The
 * per-portal parts (brand, the info block under the header, nav, and the "back"
 * link) come in as props.
 */
export function PortalSidebar({
  brandHref,
  brandTitle,
  infoSlot,
  nav,
  backHref,
  backLabel,
  email,
  logoutLabel,
  openLabel,
  closeLabel,
  locale,
}: {
  brandHref: string;
  brandTitle: string;
  infoSlot?: React.ReactNode;
  nav: PortalNavItem[];
  backHref: string;
  backLabel: string;
  email: string;
  logoutLabel: string;
  openLabel: string;
  closeLabel: string;
  locale: Locale;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href={brandHref} className="flex items-center gap-2 font-semibold">
          <GraduationCap className="h-6 w-6 text-primary" />
          <span className="text-sm">{brandTitle}</span>
        </Link>
        <button
          className="flex h-10 w-10 items-center justify-center -mr-2 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label={closeLabel}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {infoSlot}

      <nav className="flex-1 space-y-0.5 px-3">
        {nav.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4.5 w-4.5" /> {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1 text-xs text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
        <div className="my-2 h-px bg-border" />
        <Link
          href={backHref}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-muted"
        >
          <ArrowLeft className="h-4.5 w-4.5" /> {backLabel}
        </Link>
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center justify-between px-2 py-2">
          <p className="truncate text-xs text-muted">{email}</p>
          <ThemeToggle locale={locale} />
        </div>
        <form action={logoutAction}>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-muted hover:text-danger">
            <LogOut className="h-4.5 w-4.5" /> {logoutLabel}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
        <span className="flex items-center gap-2 font-semibold">
          <GraduationCap className="h-5 w-5 text-primary" /> {brandTitle}
        </span>
        <button
          className="flex h-10 w-10 items-center justify-center -mr-2"
          onClick={() => setOpen(true)}
          aria-label={openLabel}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block">
        <div className="sticky top-0 h-screen">{content}</div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" className="absolute left-0 top-0 h-full w-72 bg-surface shadow-xl">
            {content}
          </div>
        </div>
      )}
    </>
  );
}
