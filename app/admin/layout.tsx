import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminSidebar } from "@/components/admin-sidebar";
import { getT } from "@/lib/locale";
import styles from "./admin-shell.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.adminNav.metaTitle };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const { locale } = await getT();
  const [pendingSubmissions, pendingOpportunities] = await Promise.all([
    prisma.userSubmission.count({ where: { status: "PENDING" } }),
    prisma.opportunity.count({ where: { status: { in: ["PENDING_REVIEW", "SUSPICIOUS"] } } }),
  ]);
  const moderationCount = pendingSubmissions + pendingOpportunities;

  return (
    <div className={styles.shell}>
      <AdminSidebar email={admin.email} moderationCount={moderationCount} locale={locale} />
      <div className={styles.content}>
        <div className={styles.contentInner}>{children}</div>
      </div>
    </div>
  );
}
