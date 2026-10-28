import Link from "next/link";
import { GraduationCap, Home, Search } from "lucide-react";
import { getT } from "@/lib/locale";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <Link href="/" className="mb-8 flex items-center gap-2 font-semibold">
        <GraduationCap className="h-6 w-6 text-primary" />
        Extravity
      </Link>
      <p className="text-6xl font-semibold text-primary">404</p>
      <h1 className="mt-4 text-2xl font-semibold">{t.errorPage.notFoundTitle}</h1>
      <p className="mt-2 max-w-md text-muted">
        {t.errorPage.notFoundDescription}
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Home className="h-4 w-4" /> {t.errorPage.toHome}
        </Link>
        <Link
          href="/catalog"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface-muted"
        >
          <Search className="h-4 w-4" /> {t.errorPage.toCatalog}
        </Link>
      </div>
    </div>
  );
}
