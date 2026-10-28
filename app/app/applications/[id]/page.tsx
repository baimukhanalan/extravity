import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, CalendarClock } from "lucide-react";
import type { ApplicationStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ApplicationWorkspace } from "@/components/application-workspace";
import { ApplicationComments } from "@/components/application-comments";
import { ApplicationReadiness, type ApplicationReadinessItem } from "@/components/application-readiness";
import { Badge, Card } from "@/components/ui";
import { REQUIRED_DOCUMENTS } from "@/lib/constants";
import { calculateAge, deadlineLabel, formatDate } from "@/lib/utils";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import { normalizeDocumentType } from "@/lib/document-types";
import { acceptableDocumentScanStatus } from "@/lib/document-scan";
import { getOpportunityAvailability } from "@/lib/opportunity-availability";
import styles from "../../portal-pages.module.css";

export default async function ApplicationWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { t, locale } = await getT();
  const user = await requireUser();
  const app = await prisma.application.findFirst({
    where: { id, userId: user.id },
    include: {
      opportunity: { include: { category: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { email: true, studentProfile: { select: { firstName: true, lastName: true } } } } },
      },
    },
  });
  if (!app) notFound();
  const opportunityAvailable = getOpportunityAvailability(app.opportunity).canApply;
  const comments = app.comments;
  const [documents, activeParentConsent] = await Promise.all([
    prisma.document.findMany({
      where: { userId: user.id, isMock: false },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    }),
    prisma.parentStudentLink.findFirst({
      where: {
        studentUserId: user.id,
        status: "active",
        consents: { some: { type: "APPLICATION_SUBMIT", granted: true } },
      },
      select: { id: true },
    }),
  ]);

  const p = user.studentProfile;
  const age = calculateAge(p?.birthDate);
  const profileMissing = [
    !p?.birthDate && t.applications.packBirthDate,
    !p?.city && t.applications.packCity,
    !p?.school && t.applications.packSchool,
    !p?.grade && t.applications.packGrade,
  ].filter(Boolean) as string[];
  const uploadedDocumentTypes = new Set(documents.map((document) => normalizeDocumentType(document.type)).filter(Boolean));
  const verifiedDocumentTypes = new Set(documents
    .filter((document) => document.versions.some((version) => version.verificationStatus === "VERIFIED" && acceptableDocumentScanStatus(version.scanStatus)))
    .map((document) => normalizeDocumentType(document.type))
    .filter(Boolean));
  const missingDocuments = app.opportunity.requiredDocuments.filter((type) => !uploadedDocumentTypes.has(normalizeDocumentType(type)));
  const pendingDocuments = app.opportunity.requiredDocuments.filter((type) => {
    const normalized = normalizeDocumentType(type);
    return normalized && uploadedDocumentTypes.has(normalized) && !verifiedDocumentTypes.has(normalized);
  });
  const guardianRequired = age !== null && age < 18;
  const readinessItems: ApplicationReadinessItem[] = [
    {
      key: "profile",
      state: profileMissing.length > 0 ? "action" : "ready",
      label: t.applications.readinessProfile,
      detail: profileMissing.length > 0
        ? interpolate(t.applications.readinessMissing, { fields: profileMissing.join(", ") })
        : t.applications.readinessProfileReady,
      href: "/app/profile",
    },
    {
      key: "documents",
      state: missingDocuments.length > 0 ? "action" : pendingDocuments.length > 0 ? "pending" : "ready",
      label: t.applications.readinessDocuments,
      detail: missingDocuments.length > 0
        ? interpolate(t.applications.readinessDocumentsMissing, { count: missingDocuments.length })
        : pendingDocuments.length > 0
          ? interpolate(t.applications.readinessDocumentsPending, { count: pendingDocuments.length })
          : t.applications.readinessDocumentsReady,
      href: "/app/documents",
    },
    ...(guardianRequired ? [{
      key: "guardian",
      state: activeParentConsent ? "ready" as const : "action" as const,
      label: t.applications.readinessGuardian,
      detail: activeParentConsent ? t.applications.readinessGuardianReady : t.applications.readinessGuardianMissing,
      href: "/app/settings",
    }] : []),
  ];

  const pack = [
    { label: t.applications.packFullName, value: p ? `${p.firstName} ${p.lastName}` : "" },
    { label: t.applications.packEmail, value: user.email },
    { label: t.applications.packBirthDate, value: p?.birthDate ? formatDate(p.birthDate) : "" },
    { label: t.applications.packAge, value: age ? `${age}` : "" },
    { label: t.applications.packCity, value: p?.city ?? "" },
    { label: t.applications.packSchool, value: p?.school ?? "" },
    { label: t.applications.packGrade, value: p?.grade ? `${p.grade}` : "" },
    { label: t.applications.packPhone, value: p?.phone ?? "" },
  ];

  const dl = deadlineLabel(app.opportunity.applicationDeadline);
  return (
    <div className={styles.detailFlow}>
      <Link href="/app/applications" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-4 w-4" /> {t.applications.backToApplications}
      </Link>

      <div className={styles.detailHeader}>
        <Badge tone="primary" className="mb-2">{app.opportunity.category.nameRu}</Badge>
        <h1 className={styles.title}>{app.opportunity.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
          <Link href={`/opportunities/${app.opportunity.slug}`} className="text-primary hover:underline">
            {t.applications.openOpportunity}
          </Link>
          <span className="flex items-center gap-1"><CalendarClock className="h-4 w-4" /> {dl.text}</span>
          {app.opportunity.requiredDocuments.length > 0 && (
            <span className="flex items-center gap-1">
              <FileText className="h-4 w-4" /> {interpolate(t.applications.documentsCount, { count: app.opportunity.requiredDocuments.length })}
            </span>
          )}
        </div>
      </div>

      {app.opportunity.requiredDocuments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {app.opportunity.requiredDocuments.map((d) => (
            <Badge key={d}>{REQUIRED_DOCUMENTS[d] ?? d}</Badge>
          ))}
        </div>
      )}

      {!opportunityAvailable && (
        <Card className="border-border bg-surface-muted p-5">
          <Badge tone="muted">{t.applications.historicalBadge}</Badge>
          <h2 className="mt-2 font-semibold">{t.applications.historicalNoticeTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.applications.historicalNotice}</p>
        </Card>
      )}

      {opportunityAvailable && <div className={styles.storySection}><ApplicationReadiness items={readinessItems} locale={locale} /></div>}

      <div className={styles.storySection}><ApplicationWorkspace
        applicationId={app.id}
        initialChecklist={app.checklist as { id: string; label: string; done: boolean }[]}
        initialProgress={app.progress}
        initialStatus={app.status as ApplicationStatus}
        initialNotes={app.notes}
        pack={pack}
        locale={locale}
        readOnly={!opportunityAvailable}
      /></div>

      <div className={styles.storySection}>
        <ApplicationComments
          applicationId={app.id}
          comments={comments.map((c) => ({
            id: c.id,
            body: c.body,
            authorRole: c.authorRole,
            authorName: c.author.studentProfile
              ? `${c.author.studentProfile.firstName} ${c.author.studentProfile.lastName}`.trim()
              : c.author.email,
            createdAt: c.createdAt.toISOString(),
            own: c.authorUserId === user.id,
          }))}
          locale={locale}
        />
      </div>
    </div>
  );
}
