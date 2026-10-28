import { requireCounselor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/locale";
import { CounselorSidebar } from "@/components/counselor-sidebar";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.counsNav.cabinetTitle };
}

export default async function CounselorLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireCounselor();
  const { locale } = await getT();
  const pendingCount = await prisma.counselorStudentLink.count({
    where: { counselorId: profile.id, status: "pending" },
  });

  return (
    <div className="flex min-h-screen bg-background">
      <CounselorSidebar
        name={profile.fullName}
        email={user.email}
        school={profile.school}
        pendingCount={pendingCount}
        locale={locale}
      />
      <div className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </div>
    </div>
  );
}
