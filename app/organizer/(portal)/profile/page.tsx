import { BadgeCheck, Clock, XCircle } from "lucide-react";
import { requireOrganizer } from "@/lib/auth";
import { updateOrganizerProfile, requestVerification } from "@/app/actions/organizer";
import { OrganizerProfileForm } from "@/components/organizer-profile-form";
import { RequestVerificationButton } from "@/components/request-verification-button";
import { Card, Badge } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { interpolate } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import styles from "../organizer-sections.module.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.orgNav.organization };
}

export default async function OrganizerProfilePage() {
  const { organizer } = await requireOrganizer();
  const { t, locale } = await getT();

  const statusView: Record<string, { tone: "success" | "warning" | "danger" | "muted"; label: string; icon: typeof BadgeCheck }> = {
    VERIFIED: { tone: "success", label: t.orgProfile.statusVerified, icon: BadgeCheck },
    PENDING: { tone: "warning", label: t.orgProfile.statusPending, icon: Clock },
    REJECTED: { tone: "danger", label: t.orgProfile.statusRejected, icon: XCircle },
    SUSPENDED: { tone: "danger", label: t.orgProfile.statusSuspended, icon: XCircle },
    UNVERIFIED: { tone: "muted", label: t.orgProfile.statusUnverified, icon: Clock },
  };

  const view = statusView[organizer.verificationStatus] ?? statusView.UNVERIFIED;
  const Icon = view.icon;
  const canRequest = organizer.verificationStatus !== "VERIFIED" && organizer.verificationStatus !== "PENDING";

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1>{t.orgNav.organization}</h1>
          <p className="mt-1 text-muted">{t.orgProfile.subtitle}</p>
        </div>
      </header>

      <Card className={`${styles.panel} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-muted">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-medium">{t.orgProfile.verificationStatus}</p>
              <p className="text-xs text-muted">
                {organizer.verificationRequestedAt
                  ? interpolate(t.orgProfile.requestSent, { date: formatDate(organizer.verificationRequestedAt) })
                  : t.orgProfile.requestNotSent}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={view.tone}>{view.label}</Badge>
            {canRequest && (
              <form action={requestVerification}>
                <RequestVerificationButton label={t.orgProfile.requestVerification} />
              </form>
            )}
          </div>
        </div>

        {organizer.verificationNote && (
          <p className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
            {interpolate(t.orgProfile.moderatorNote, { note: organizer.verificationNote })}
          </p>
        )}
      </Card>

      <div className={styles.formSection}>
        <OrganizerProfileForm
          action={updateOrganizerProfile}
          submitLabel={t.orgOpps.save}
          locale={locale}
          defaults={{
            name: organizer.name,
            type: organizer.type,
            bin: organizer.bin,
            website: organizer.website,
            email: organizer.email,
            phone: organizer.phone,
            city: organizer.city,
            description: organizer.description,
          }}
        />
      </div>
    </div>
  );
}
