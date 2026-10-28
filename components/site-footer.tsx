import Link from "next/link";
import { GraduationCap } from "lucide-react";
import type { Dict } from "@/lib/i18n";

export function SiteFooter({ nav, footer }: { nav: Dict["nav"]; footer: Dict["footer"] }) {
  const showDemoLabel = process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true";
  const groups = [
    {
      title: footer.product,
      links: [
        { href: "/catalog", label: footer.catalogFull },
        { href: "/news", label: nav.news },
        { href: "/pricing", label: nav.pricing },
        { href: "/for-students", label: nav.forStudents },
        { href: "/for-parents", label: nav.forParents },
      ],
    },
    {
      title: footer.organizations,
      links: [
        { href: "/for-schools", label: nav.forSchools },
        { href: "/for-organizers", label: nav.forOrganizers },
        { href: "/organizer/register", label: footer.publish },
      ],
    },
    {
      title: footer.company,
      links: [
        { href: "/security", label: nav.security },
        { href: "/faq", label: nav.faq },
        { href: "/privacy", label: nav.privacy },
        { href: "/terms", label: nav.terms },
        { href: "/contact", label: nav.contact },
      ],
    },
  ];

  return (
    <footer className="mt-auto border-t border-white/10 bg-[#101d36] text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 xl:grid-cols-[1.35fr_repeat(3,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <GraduationCap className="h-6 w-6 text-[#a9c7ff]" />
              Extravity
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-7 text-slate-300">{footer.tagline}</p>
          </div>
          {groups.map((g) => (
            <div key={g.title}>
              <h4 className="text-sm font-semibold text-white">{g.title}</h4>
              <ul className="mt-4 space-y-3">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-slate-300 transition-colors hover:text-white focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a9c7ff]">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/15 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Extravity.{showDemoLabel ? ` ${footer.demo}` : ""}</p>
          <p>{footer.madeFor} · RU / KZ / EN</p>
        </div>
      </div>
    </footer>
  );
}
