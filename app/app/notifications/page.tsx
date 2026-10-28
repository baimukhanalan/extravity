import Link from "next/link";
import { Bell, BellOff } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markAllNotificationsRead } from "@/app/actions/misc";
import { Card, EmptyState } from "@/components/ui";
import { MarkAllReadButton } from "./mark-all-read-button";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import styles from "../portal-pages.module.css";

export default async function NotificationsPage() {
  const { t } = await getT();
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{t.notifications.title}</h1>
          <p className={styles.subtitle}>{unread > 0 ? interpolate(t.notifications.unreadCount, { n: unread }) : t.notifications.allRead}</p>
        </div>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <MarkAllReadButton label={t.notifications.markAllRead} />
          </form>
        )}
      </div>

      <div className={styles.storySection}>
        {notifications.length === 0 ? (
          <EmptyState icon={<BellOff className="h-8 w-8" />} title={t.notifications.emptyTitle} description={t.notifications.emptyDescription} />
        ) : (
          <div className={styles.noticeList}>
            {notifications.map((n) => {
              const inner = (
                <Card className={`${styles.noticeCard} ${!n.isRead ? "border-primary/30 bg-primary/5" : ""}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${!n.isRead ? "bg-primary/15 text-primary" : "bg-surface-muted text-muted"}`}>
                      <Bell className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                      <p className="mt-1 text-xs text-muted">{formatDate(n.createdAt)}</p>
                    </div>
                  </div>
                </Card>
              );
              return n.link ? <Link key={n.id} href={n.link} className={styles.noticeLink}>{inner}</Link> : <div key={n.id}>{inner}</div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
