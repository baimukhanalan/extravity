"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitch } from "@/components/locale-switch";
import { ButtonLink } from "@/components/ui";
import type { Dict, Locale } from "@/lib/i18n";

export function SiteHeader({
  authed,
  locale,
  nav,
  header,
}: {
  authed: boolean;
  locale: Locale;
  nav: Dict["nav"];
  header: Dict["header"];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { href: "/catalog", label: nav.catalog },
    { href: "/news", label: nav.news },
    { href: "/for-students", label: nav.forStudents },
    { href: "/for-parents", label: nav.forParents },
    { href: "/for-schools", label: nav.forSchools },
    { href: "/pricing", label: nav.pricing },
    { href: "/security", label: nav.security },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <GraduationCap className="h-6 w-6 text-primary" />
          <span>Extravity</span>
        </Link>

        <nav className="hidden items-center gap-0.5 xl:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className={`whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-surface-muted hover:text-foreground ${pathname === l.href ? "bg-primary/10 font-medium text-primary" : "text-muted"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 whitespace-nowrap xl:flex">
          <LocaleSwitch current={locale} />
          <ThemeToggle locale={locale} />
          {authed ? (
            <ButtonLink href="/app" size="sm">{header.toPortal}</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">{header.login}</ButtonLink>
              <ButtonLink href="/signup" size="sm">{header.signup}</ButtonLink>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 xl:hidden">
          <ThemeToggle locale={locale} />
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-muted"
            aria-label={header.menu}
            aria-expanded={open}
            aria-controls="mobile-site-navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-site-navigation" className="border-t border-border bg-surface px-4 py-3 xl:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                aria-current={pathname === l.href ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm hover:bg-surface-muted ${pathname === l.href ? "bg-primary/10 font-medium text-primary" : "text-muted"}`}
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2"><LocaleSwitch current={locale} className="w-fit" /></div>
            <div className="mt-2 flex gap-2">
              {authed ? (
                <ButtonLink href="/app" size="sm" className="flex-1">{header.toPortal}</ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/login" variant="outline" size="sm" className="flex-1">{header.login}</ButtonLink>
                  <ButtonLink href="/signup" size="sm" className="flex-1">{header.signup}</ButtonLink>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
