import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [user, { locale, t }] = await Promise.all([getCurrentUser(), getT()]);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader authed={!!user} locale={locale} nav={t.nav} header={t.header} />
      <main className="flex-1">{children}</main>
      <SiteFooter nav={t.nav} footer={t.footer} />
    </div>
  );
}
