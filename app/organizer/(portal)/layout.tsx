import { requireOrganizer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrganizerSidebar } from "@/components/organizer-sidebar";
import { getT } from "@/lib/locale";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.orgNav.cabinetTitle };
}

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const { user, organizer } = await requireOrganizer();
  const { locale } = await getT();
  const pendingCount = await prisma.opportunity.count({
    where: { organizerId: organizer.id, moderationStatus: "PENDING" },
  });

  return (
    <div className="flex min-h-screen bg-background">
      <OrganizerSidebar
        name={organizer.name}
        email={user.email}
        verification={organizer.verificationStatus}
        pendingCount={pendingCount}
        locale={locale}
      />
      <div className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </div>
    </div>
  );
}
