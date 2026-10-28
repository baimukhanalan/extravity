"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShieldAlert, Sparkles, Link2, Users, Radio, ScrollText, Newspaper,
  GraduationCap, LogOut, Menu, X, ArrowLeft, Cpu, Flag, ToggleRight, Building2, Grid3x3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/app/actions/auth";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

export function AdminSidebar({
  email,
  moderationCount,
  locale = DEFAULT_LOCALE,
}: {
  email: string;
  moderationCount: number;
  locale?: Locale;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dict = getDictionary(locale);
  const d = dict.adminNav;

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

  const nav = [
    { href: "/admin", label: d.overview, icon: LayoutDashboard, exact: true },
    { href: "/admin/moderation", label: d.moderation, icon: ShieldAlert },
    { href: "/admin/opportunities", label: d.opportunities, icon: Sparkles },
    { href: "/admin/news", label: locale === "en" ? "News" : locale === "kk" ? "Жаңалықтар" : "Новости", icon: Newspaper },
    { href: "/admin/coverage", label: d.coverage, icon: Grid3x3 },
    { href: "/admin/submissions", label: d.submissions, icon: Link2 },
    { href: "/admin/users", label: d.users, icon: Users },
    { href: "/admin/organizers", label: d.organizers, icon: Building2 },
    { href: "/admin/complaints", label: d.complaints, icon: Flag },
    { href: "/admin/sources", label: d.sources, icon: Radio },
    { href: "/admin/parser", label: d.parserTasks, icon: Cpu },
    { href: "/admin/flags", label: "Feature flags", icon: ToggleRight },
    { href: "/admin/audit", label: d.audit, icon: ScrollText },
  ];

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <GraduationCap className="h-6 w-6 text-warning" />
          <span className="text-sm">{d.brand}</span>
        </Link>
        <button aria-label={dict.header.close} className="flex h-10 w-10 items-center justify-center -mr-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
      </div>
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
                active ? "bg-warning/10 text-warning" : "text-muted hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4.5 w-4.5" /> {item.label}
              {item.href === "/admin/moderation" && moderationCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1 text-xs text-white">
                  {moderationCount}
                </span>
              )}
            </Link>
          );
        })}
        <div className="my-2 h-px bg-border" />
        <Link href="/app" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-muted">
          <ArrowLeft className="h-4.5 w-4.5" /> {d.toStudentPortal}
        </Link>
      </nav>
      <div className="border-t border-border p-3">
        <div className="flex items-center justify-between px-2 py-2">
          <p className="truncate text-xs text-muted">{email}</p>
          <ThemeToggle locale={locale} />
        </div>
        <form action={logoutAction}>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <LogOut className="h-4.5 w-4.5" /> {d.logout}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
        <span className="flex items-center gap-2 font-semibold"><GraduationCap className="h-5 w-5 text-warning" /> {d.adminShort}</span>
        <button aria-label={dict.header.menu} className="flex h-10 w-10 items-center justify-center -mr-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
      </div>
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block">
        <div className="sticky top-0 h-screen">{content}</div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" className="absolute left-0 top-0 h-full w-72 bg-surface shadow-xl">{content}</div>
        </div>
      )}
    </>
  );
}
