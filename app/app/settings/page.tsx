import { Globe, Moon, Download, Bell, Users, UserCog } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LanguagePicker } from "@/components/language-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { ParentInvite } from "@/components/parent-invite";
import { CounselorAccess } from "@/components/counselor-access";
import { NotificationSettings } from "@/components/notification-settings";
import { PushToggle } from "@/components/push-toggle";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { deleteAccountAction } from "@/app/actions/auth";
import { Card, Label } from "@/components/ui";
import { getT } from "@/lib/locale";
import styles from "../portal-pages.module.css";

export default async function SettingsPage() {
  const user = await requireUser();
  const { t, locale } = await getT();
  const p = t.portal;
  const botName = process.env.TELEGRAM_BOT_USERNAME || null;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
  const [prefs, parentLinks, counselorLinks] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
    prisma.parentStudentLink.findMany({
      where: { studentUserId: user.id },
      include: { consents: { select: { type: true, granted: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.counselorStudentLink.findMany({
      where: { studentUserId: user.id, status: { in: ["active", "pending"] } },
      include: { counselor: { select: { fullName: true, school: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{p.settingsTitle}</h1>
          <p className={styles.subtitle}>{p.settingsSub}</p>
        </div>
      </div>

      <div className={styles.settingsStack}>
        <Card className={`${styles.settingsCard} ${styles.storySection}`}>
          <div className="flex items-center gap-2"><Globe className="h-5 w-5 text-primary" /><h2 className="font-semibold">{p.langSection}</h2></div>
          <p className="mt-1 text-sm text-muted">{p.langSub}</p>
          <div className="mt-3"><LanguagePicker current={user.locale} /></div>
        </Card>

        <Card className={`${styles.settingsCard} ${styles.storySection}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Moon className="h-5 w-5 text-primary" /><h2 className="font-semibold">{p.themeSection}</h2></div>
            <ThemeToggle locale={locale} />
          </div>
          <p className="mt-1 text-sm text-muted">{p.themeSub}</p>
        </Card>

        <Card className={`${styles.settingsCard} ${styles.storySection}`}>
          <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /><h2 className="font-semibold">{p.notifSection}</h2></div>
          <div className="mt-3">
            <NotificationSettings
              prefs={{
                inApp: prefs?.inApp ?? true,
                email: prefs?.email ?? true,
                telegram: prefs?.telegram ?? false,
                quietHoursStart: prefs?.quietHoursStart ?? null,
                quietHoursEnd: prefs?.quietHoursEnd ?? null,
              }}
              telegramLinked={!!user.telegramChatId}
              telegramBotUrl={botName ? "/api/telegram/link" : null}
            />
          </div>
          {vapidPublicKey && (
            <div className="mt-4 border-t border-border pt-4">
              <PushToggle vapidPublicKey={vapidPublicKey} />
            </div>
          )}
        </Card>

        <Card className={`${styles.settingsCard} ${styles.storySection}`}>
          <div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><h2 className="font-semibold">{p.parentSection}</h2></div>
          <p className="mt-1 text-sm text-muted">{p.parentSub}</p>
          <div className="mt-4"><ParentInvite links={parentLinks} locale={locale} /></div>
        </Card>

        <Card className={`${styles.settingsCard} ${styles.storySection}`}>
          <div className="flex items-center gap-2"><UserCog className="h-5 w-5 text-primary" /><h2 className="font-semibold">{p.counselorSection}</h2></div>
          <p className="mt-1 text-sm text-muted">{p.counselorSub}</p>
          <div className="mt-4">
            <CounselorAccess
              locale={locale}
              links={counselorLinks.map((l) => ({
                id: l.id,
                status: l.status,
                counselorName: l.counselor.fullName,
                school: l.counselor.school,
              }))}
            />
          </div>
        </Card>

        <Card className={`${styles.settingsCard} ${styles.storySection}`}>
          <h2 className="font-semibold">{p.account}</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><Label>Email</Label><span className="text-muted">{user.email}</span></div>
            <div className="flex justify-between"><Label>{p.roleLabel}</Label><span className="text-muted">{user.role}</span></div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <a
              href="/api/account/export"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="h-4 w-4" /> {p.exportData}
            </a>
            <form action={deleteAccountAction}>
              <DeleteAccountButton label={p.deleteAccount} confirmText={t.confirm.deleteAccount} />
            </form>
          </div>
          <p className="mt-2 text-xs text-muted">{p.dataNote}</p>
        </Card>
      </div>
    </div>
  );
}
