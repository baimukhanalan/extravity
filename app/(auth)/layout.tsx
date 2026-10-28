import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, CalendarClock, FileCheck2, Trophy } from "lucide-react";
import { getCurrentUser, getSession } from "@/lib/auth";
import { getT } from "@/lib/locale";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    const { t } = await getT();
    return <AuthShell t={t}>{children}</AuthShell>;
  }
  const user = await getCurrentUser();
  if (user?.isActive) redirect("/app");
  redirect("/api/auth/clear");
}

function AuthShell({ children, t }: { children: React.ReactNode; t: Awaited<ReturnType<typeof getT>>["t"] }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <GraduationCap className="h-6 w-6" />
          Extravity
        </Link>
        <div className="space-y-8">
          <h2 className="max-w-md text-3xl font-semibold leading-tight">
            {t.authPage.brandHeadline}
          </h2>
          <ul className="space-y-4 text-sm text-primary-foreground/90">
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                <GraduationCap className="h-4.5 w-4.5" />
              </span>
              {t.authPage.benefitFeed}
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                <CalendarClock className="h-4.5 w-4.5" />
              </span>
              {t.authPage.benefitDeadlines}
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                <FileCheck2 className="h-4.5 w-4.5" />
              </span>
              {t.authPage.benefitPack}
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                <Trophy className="h-4.5 w-4.5" />
              </span>
              {t.authPage.benefitPortfolio}
            </li>
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/70">
          {t.authPage.footnote}
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
