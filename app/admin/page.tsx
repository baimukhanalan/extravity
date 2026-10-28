import Link from "next/link";
import {
  Users, Sparkles, ShieldAlert, CalendarClock, FileText, Link2, TrendingUp, ScrollText, ArrowUpRight,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui";
import { daysFromNow, formatDate } from "@/lib/utils";
import { interpolate } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import styles from "./dashboard.module.css";

export default async function AdminDashboard() {
  const { locale, t } = await getT();
  const now = new Date();
  const week = daysFromNow(-7);
  const nextWeek = daysFromNow(7);

  const [users, newUsers, published, pendingSubs, pendingOpportunities, totalSubs, deadlines, applications, subs, recentAudit] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: week } } }),
    prisma.opportunity.count({ where: { status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"] } } }),
    prisma.userSubmission.count({ where: { status: "PENDING" } }),
    prisma.opportunity.count({ where: { status: { in: ["PENDING_REVIEW", "SUSPICIOUS"] } } }),
    prisma.userSubmission.count(),
    prisma.opportunity.count({ where: { applicationDeadline: { gte: now, lte: nextWeek } } }),
    prisma.application.count(),
    prisma.subscription.count({ where: { status: "active" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { email: true } } } }),
  ]);

  const stats = [
    { icon: Users, label: t.adminHome.statUsers, value: users, sub: interpolate(t.adminHome.statUsersSub, { n: newUsers }), href: "/admin/users" },
    { icon: Sparkles, label: t.adminHome.statPublished, value: published, href: "/admin/opportunities" },
    { icon: ShieldAlert, label: t.adminHome.statModeration, value: pendingSubs + pendingOpportunities, href: "/admin/moderation", warn: pendingSubs + pendingOpportunities > 0 },
    { icon: CalendarClock, label: t.adminHome.statDeadlines7, value: deadlines, href: "/admin/opportunities" },
    { icon: FileText, label: t.adminHome.statApplications, value: applications, href: null },
    { icon: Link2, label: t.adminHome.statSubmissions, value: totalSubs, href: "/admin/submissions" },
    { icon: TrendingUp, label: t.adminHome.statActiveSubs, value: subs, href: null },
  ];
  const quickLinks = [
    { href: "/admin/moderation", label: t.adminHome.statModeration, count: pendingSubs + pendingOpportunities, icon: ShieldAlert },
    { href: "/admin/opportunities", label: t.adminHome.statDeadlines7, count: deadlines, icon: CalendarClock },
  ];

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{locale === "en" ? "Operations" : locale === "kk" ? "Басқару" : "Управление"}</span>
          <h1>{t.adminHome.title}</h1>
          <p>{t.adminHome.subtitle}</p>
        </div>
        <span className={styles.liveLabel}>{locale === "en" ? "Live data" : locale === "kk" ? "Нақты деректер" : "Актуальные данные"}</span>
      </header>

      <section aria-labelledby="admin-priority-title" className={styles.priorities}>
        <div className={styles.sectionHead}><h2 id="admin-priority-title">{locale === "en" ? "First to review" : locale === "kk" ? "Алдымен тексеру" : "Проверить в первую очередь"}</h2><p>{locale === "en" ? "Work queues and approaching deadlines" : locale === "kk" ? "Кезектер мен жақындаған мерзімдер" : "Очереди задач и ближайшие сроки"}</p></div>
        <div className={styles.priorityGrid}>{quickLinks.map((item) => <Link key={item.href} href={item.href} className={styles.priorityLink}>
          <item.icon aria-hidden="true" className={styles.priorityIcon} />
          <span><strong>{item.count}</strong><small>{item.label}</small></span>
          <ArrowUpRight aria-hidden="true" className={styles.arrow} />
        </Link>)}</div>
      </section>

      <section aria-labelledby="admin-overview-title" className={styles.overview}>
        <div className={styles.sectionHead}><h2 id="admin-overview-title">{locale === "en" ? "Platform overview" : locale === "kk" ? "Платформаға шолу" : "Обзор платформы"}</h2></div>
      <div className={styles.statGrid}>
        {stats.map((s) => {
          const card = (
            <div className={`${styles.statCard} ${s.warn ? styles.statWarn : ""}`}>
              <div className={styles.statTop}><s.icon aria-hidden="true" /><span>{s.href && <ArrowUpRight aria-hidden="true" />}</span></div>
              <div>
                <p className={styles.statValue}>{s.value}</p>
                <p className={styles.statLabel}>{s.label}</p>
              </div>
              {s.sub && <p className={styles.statSub}>{s.sub}</p>}
            </div>
          );
          return s.href ? <Link key={s.label} href={s.href} className={styles.statLink}>{card}</Link> : <div key={s.label}>{card}</div>;
        })}
      </div>
      </section>

      <section aria-labelledby="admin-audit-title" className={styles.audit}>
        <div className={styles.sectionHead}>
          <h2 id="admin-audit-title"><ScrollText aria-hidden="true" />{t.adminHome.auditTitle}</h2>
          <Link href="/admin/audit">{locale === "en" ? "View all" : locale === "kk" ? "Барлығын көру" : "Все действия"}<ArrowUpRight aria-hidden="true" /></Link>
        </div>
        <div className={styles.auditList}>
          {recentAudit.length === 0 ? (
            <p className={styles.empty}>{t.adminHome.auditEmpty}</p>
          ) : (
            recentAudit.map((a) => (
              <div key={a.id} className={styles.auditRow}>
                <div className={styles.auditActor}>
                  <Badge tone="neutral">{a.action}</Badge>
                  <span>{a.user?.email ?? t.adminHome.systemUser}</span>
                </div>
                <time dateTime={a.createdAt.toISOString()}>{formatDate(a.createdAt)}</time>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
