"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Compass, Bookmark, Calendar, FileText, FolderOpen, Trophy, Award,
  PlusCircle, Bell, User, Settings, CreditCard, LogOut, GraduationCap,
  Menu, X, ShieldCheck, Sparkles, Building2,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/app/actions/auth";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export function AppSidebar({
  name,
  email,
  unread,
  isStaff,
  portals = [],
  locale = DEFAULT_LOCALE,
}: {
  name: string;
  email: string;
  unread: number;
  isStaff: boolean;
  /** Other portals this account already has access to (organizer, counsellor, parent). */
  portals?: { href: string; label: string }[];
  locale?: Locale;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dict = getDictionary(locale);
  const l = dict.appNav;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const nav = [
    { href: "/app", label: l.home, icon: Home, exact: true },
    { href: "/app/discover", label: l.feed, icon: Compass },
    { href: "/app/recommendations", label: l.recommendations, icon: Sparkles },
    { href: "/app/saved", label: l.saved, icon: Bookmark },
    { href: "/app/calendar", label: l.calendar, icon: Calendar },
    { href: "/app/applications", label: l.applications, icon: FileText },
    { href: "/app/documents", label: l.documents, icon: FolderOpen },
    { href: "/app/portfolio", label: l.portfolio, icon: Trophy },
    { href: "/app/achievements", label: l.achievements, icon: Award },
    { href: "/app/submit", label: l.submit, icon: PlusCircle },
  ];

  const bottom = [
    { href: "/app/notifications", label: l.notifications, icon: Bell },
    { href: "/app/profile", label: l.profile, icon: User },
    { href: "/app/subscription", label: l.subscription, icon: CreditCard },
    { href: "/app/settings", label: l.settings, icon: Settings },
  ];

  function NavLink({ item }: { item: (typeof nav)[number] }) {
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    return (
      <Link
        href={item.href}
        onClick={() => setOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground",
        )}
      >
        <item.icon className="h-4.5 w-4.5" />
        {item.label}
        {item.href === "/app/notifications" && unread > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
            {unread}
          </span>
        )}
      </Link>
    );
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <GraduationCap className="h-6 w-6 text-primary" />
          <span className="text-sm">Extravity</span>
        </Link>
        <button className="flex h-10 w-10 items-center justify-center -mr-2 lg:hidden" onClick={() => setOpen(false)} aria-label={dict.header.close ?? "Close"}><X className="h-5 w-5" /></button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav.map((item) => <NavLink key={item.href} item={item} />)}
        <div className="my-2 h-px bg-border" />
        {bottom.map((item) => <NavLink key={item.href} item={item} />)}
        {portals.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            <Building2 className="h-4.5 w-4.5" /> {p.label}
          </Link>
        ))}
        {isStaff && (
          <Link
            href="/admin"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-warning hover:bg-warning/10"
          >
            <ShieldCheck className="h-4.5 w-4.5" /> {l.admin}
          </Link>
        )}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            {initials(name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>
          <ThemeToggle locale={locale} />
        </div>
        <form action={logoutAction}>
          <button className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-muted hover:text-danger">
            <LogOut className="h-4.5 w-4.5" /> {l.logout}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
        <Link href="/app" className="flex items-center gap-2 font-semibold">
          <GraduationCap className="h-5 w-5 text-primary" /> <span className="text-sm">Extravity</span>
        </Link>
        <button className="flex h-10 w-10 items-center justify-center -mr-2" onClick={() => setOpen(true)} aria-label={dict.header.menu}><Menu className="h-5 w-5" /></button>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 top-0 h-full w-72 bg-surface shadow-xl">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
