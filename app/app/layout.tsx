import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppSidebar } from "@/components/app-sidebar";
import { getT } from "@/lib/locale";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Staff go to admin; students without onboarding are routed there by pages.
  const [{ t, locale }, unread, counselor, parentLinks] = await Promise.all([
    getT(),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    prisma.counselorProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
    prisma.parentStudentLink.count({ where: { parentUserId: user.id, status: "active" } }),
  ]);
  const name = user.studentProfile
    ? `${user.studentProfile.firstName} ${user.studentProfile.lastName}`.trim()
    : user.email;
  const isStaff = ["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(user.role);

  const portals = [
    user.organizer && { href: "/organizer", label: t.cabinet.organizerCabinet },
    counselor && { href: "/counselor", label: t.cabinet.counselorCabinet },
    parentLinks > 0 && { href: "/parent", label: t.cabinet.parentCabinet },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <AppSidebar name={name} email={user.email} unread={unread} isStaff={isStaff} portals={portals} locale={locale} />
      <div className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </div>
    </div>
  );
}

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.cabinet.portalTitle };
}
