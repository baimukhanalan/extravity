import { requireParent } from "@/lib/auth";
import { ParentSidebar } from "@/components/parent-sidebar";
import { getT } from "@/lib/locale";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.parentNav.cabinetTitle };
}

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const { user, links } = await requireParent();
  const { locale } = await getT();
  const pendingConsents = links.filter((l) => l.consents.every((c) => !c.granted)).length;

  return (
    <div className="flex min-h-screen bg-background">
      <ParentSidebar email={user.email} childrenCount={links.length} pendingConsents={pendingConsents} locale={locale} />
      <div className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </div>
    </div>
  );
}
