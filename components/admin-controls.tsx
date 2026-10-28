"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OpportunityMediaRightsState, OpportunityStatus, SubmissionStatus } from "@prisma/client";
import { confirmDistinctOpportunity, rejectOpportunityAsJunk, setOpportunityMediaRights, setOpportunityStatus, reviewSubmission, toggleUserActive, reviewOrganizer } from "@/app/actions/admin";
import { resolveComplaint } from "@/app/actions/complaints";
import { Select, Button, Input } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

const OPP_STATUSES: OpportunityStatus[] = [
  "DRAFT", "PENDING_REVIEW", "PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON",
  "CLOSED", "COMPLETED", "ARCHIVED", "REJECTED", "SUSPICIOUS",
];

const DESTRUCTIVE_STATUSES: OpportunityStatus[] = ["ARCHIVED", "REJECTED", "SUSPICIOUS"];
const PUBLIC_STATUSES: OpportunityStatus[] = ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"];

const PUBLICATION_CHECKS = [
  ["organizerConfirmed", "Истинный организатор проверен по первоисточнику"],
  ["ageConfirmed", "Возраст участников подтверждён"],
  ["citizenshipConfirmed", "Условия гражданства подтверждены"],
  ["deadlineConfirmed", "Дедлайн и дата закрытия подтверждены"],
  ["noConflictingDeadlines", "Противоречивых сроков не осталось"],
  ["applicationRecipientConfirmed", "Форма и получатель заявки проверены"],
] as const;

type PublicationCheckKey = typeof PUBLICATION_CHECKS[number][0];

export function OpportunityStatusSelect({ id, status, locale = DEFAULT_LOCALE }: { id: string; status: OpportunityStatus; locale?: Locale }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const dict = getDictionary(locale);
  return (
    <div className="flex flex-col gap-1">
      <Select
        value={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as OpportunityStatus;
          if (next === status) return;
          if (PUBLIC_STATUSES.includes(next)) {
            e.target.value = status;
            setReviewRequired(true);
            setError(false);
            return;
          }
          if (DESTRUCTIVE_STATUSES.includes(next) && !window.confirm(next === "ARCHIVED" ? dict.confirm.archive : dict.confirm.reject)) {
            e.target.value = status;
            return;
          }
          setError(false);
          setReviewRequired(false);
          start(async () => {
            try {
              const result = await setOpportunityStatus(id, next);
              if (!result.ok) setError(true);
            } catch {
              setError(true);
            }
          });
        }}
        className="h-9 w-40 text-xs"
      >
        {OPP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      {reviewRequired && <p className="text-xs text-warning">Для публикации откройте очередь модерации и заполните проверку условий.</p>}
      {error && <p className="text-xs text-danger">{dict.common.actionError}</p>}
    </div>
  );
}

export function SubmissionReview({ id, locale = DEFAULT_LOCALE }: { id: string; locale?: Locale }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const dict = getDictionary(locale);
  const d = dict.moderation;
  const run = (fn: () => Promise<unknown>) => {
    setError(false);
    start(async () => {
      try { await fn(); } catch { setError(true); }
    });
  };
  return (
    <div>
      <div className="flex gap-2">
        <Button size="md" variant="success" disabled={pending} onClick={() => run(() => reviewSubmission(id, "APPROVED" as SubmissionStatus))}>
          {d.approve}
        </Button>
        <Button size="md" variant="outline" disabled={pending} onClick={() => { if (!window.confirm(dict.confirm.reject)) return; run(() => reviewSubmission(id, "REJECTED" as SubmissionStatus)); }}>
          {d.reject}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{dict.common.actionError}</p>}
    </div>
  );
}

export function MediaRightsReview({ id, state }: { id: string; state: OpportunityMediaRightsState }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const [evidenceRef, setEvidenceRef] = useState("");
  const setRights = (next: OpportunityMediaRightsState) => {
    setError(false);
    start(async () => {
      try {
        const result = await setOpportunityMediaRights(id, next, evidenceRef);
        if (!result.ok) setError(true);
        else router.refresh();
      } catch {
        setError(true);
      }
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="w-full text-xs text-muted" htmlFor={`media-rights-evidence-${id}`}>Исходная публикация или разрешение на использование: ссылка без токена доступа</label>
      <input id={`media-rights-evidence-${id}`} value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} maxLength={500} className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm" placeholder="Документ/ссылка без секретов, минимум 8 символов" />
      <Button size="sm" variant={state === "APPROVED" ? "success" : "outline"} disabled={pending} onClick={() => setRights("APPROVED")}>Фото подтверждено</Button>
      <Button size="sm" variant={state === "SOURCE_POST" ? "success" : "outline"} disabled={pending} onClick={() => setRights("SOURCE_POST")}>Медиа исходного поста</Button>
      <Button size="sm" variant={state === "REJECTED" ? "danger" : "outline"} disabled={pending} onClick={() => setRights("REJECTED")}>Отклонить</Button>
      {error && <span className="text-xs text-danger">Не удалось сохранить. Для подтверждения укажите основание прав.</span>}
    </div>
  );
}

export function OpportunityModerationActions({
  id,
  publishAllowed,
  priceKnown,
  locale = DEFAULT_LOCALE,
}: {
  id: string;
  publishAllowed: boolean;
  priceKnown: boolean;
  locale?: Locale;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const [evidenceRef, setEvidenceRef] = useState("");
  const [checks, setChecks] = useState<Record<PublicationCheckKey, boolean>>({
    organizerConfirmed: false,
    ageConfirmed: false,
    citizenshipConfirmed: false,
    deadlineConfirmed: false,
    noConflictingDeadlines: false,
    applicationRecipientConfirmed: false,
  });
  const [priceReviewed, setPriceReviewed] = useState(false);
  const reviewComplete = evidenceRef.trim().length >= 8 && priceReviewed && PUBLICATION_CHECKS.every(([key]) => checks[key]);
  const dict = getDictionary(locale);
  const d = dict.moderation;

  const run = (action: () => Promise<{ ok: boolean }>) => {
    setError(false);
    start(async () => {
      try {
        const result = await action();
        if (!result.ok) setError(true);
        else router.refresh();
      } catch {
        setError(true);
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="w-full space-y-2 rounded-lg border border-border p-3 text-left sm:w-80">
        <label htmlFor={`publication-evidence-${id}`} className="block text-xs font-medium">Первоисточник или номер документа проверки</label>
        <input id={`publication-evidence-${id}`} value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} maxLength={500} className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm" placeholder="Ссылка/документ без секретов" />
        {PUBLICATION_CHECKS.map(([key, label]) => (
          <label key={key} className="flex items-start gap-2 text-xs text-muted">
            <input type="checkbox" checked={checks[key]} onChange={(event) => setChecks((current) => ({ ...current, [key]: event.target.checked }))} className="mt-0.5" />
            <span>{label}</span>
          </label>
        ))}
        <label className="flex items-start gap-2 text-xs text-muted">
          <input type="checkbox" checked={priceReviewed} onChange={(event) => setPriceReviewed(event.target.checked)} className="mt-0.5" />
          <span>{priceKnown ? "Цена или отсутствие взноса подтверждены" : "Цена не найдена в первоисточнике; показать «Стоимость уточняется у организатора»"}</span>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="success"
          disabled={pending || !publishAllowed || !reviewComplete}
          title={publishAllowed ? undefined : d.publishBlockedHint}
          onClick={() => run(() => setOpportunityStatus(id, "PUBLISHED", { evidenceRef, ...checks, priceConfirmed: priceKnown && priceReviewed, priceUnspecifiedReviewed: !priceKnown && priceReviewed }))}
        >
          {d.publish}
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(d.rejectJunkConfirm)) return;
            run(() => rejectOpportunityAsJunk(id));
          }}
        >
          {d.rejectJunk}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{dict.common.actionError}</p>}
    </div>
  );
}

export function PotentialDuplicateReview({ id, matchedTitle, matchedSlug, locale = DEFAULT_LOCALE }: {
  id: string;
  matchedTitle: string;
  matchedSlug: string;
  locale?: Locale;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [evidenceRef, setEvidenceRef] = useState("");
  const [error, setError] = useState(false);
  const language = locale === "kk" ? "kk" : locale === "en" ? "en" : "ru";
  const text = {
    ru: ["Возможный дубль опубликованной карточки:", "Подтвердить, что это другое событие", "Ссылка или документ, подтверждающий отличие", "Проверка не сохранена"],
    kk: ["Жарияланған карточканың ықтимал көшірмесі:", "Бұл басқа іс-шара екенін растау", "Айырмашылықты растайтын сілтеме немесе құжат", "Тексеру сақталмады"],
    en: ["Possible duplicate of a published card:", "Confirm this is a distinct event", "Link or document proving the distinction", "Review was not saved"],
  }[language];
  return <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
    <p>{text[0]} <a className="text-primary underline" href={`/opportunities/${matchedSlug}`}>{matchedTitle}</a></p>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input aria-label={text[2]} value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} maxLength={500}
        className="min-w-64 flex-1 rounded-lg border border-border bg-surface px-2 py-1" placeholder={text[2]} />
      <Button size="sm" variant="outline" disabled={pending || evidenceRef.trim().length < 8} onClick={() => {
        setError(false);
        start(async () => {
          try {
            const result = await confirmDistinctOpportunity(id, evidenceRef);
            if (!result.ok) setError(true);
            else router.refresh();
          } catch { setError(true); }
        });
      }}>{text[1]}</Button>
    </div>
    {error && <p className="mt-2 text-danger">{text[3]}</p>}
  </div>;
}

export function UserActiveToggle({ id, active, locale = DEFAULT_LOCALE }: { id: string; active: boolean; locale?: Locale }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const dict = getDictionary(locale);
  const d = dict.moderation;
  return (
    <div>
      <Button
        size="md"
        variant={active ? "outline" : "success"}
        disabled={pending}
        onClick={() => {
          if (active && !window.confirm(dict.confirm.block)) return;
          setError(false);
          start(async () => {
            try { await toggleUserActive(id); } catch { setError(true); }
          });
        }}
      >
        {active ? d.blockUser : d.unblockUser}
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{dict.common.actionError}</p>}
    </div>
  );
}

export function OrganizerReview({ id, locale = DEFAULT_LOCALE }: { id: string; locale?: Locale }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);
  const dict = getDictionary(locale);
  const d = dict.moderation;
  const run = (fn: () => Promise<unknown>) => {
    setError(false);
    start(async () => {
      try { await fn(); } catch { setError(true); }
    });
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={d.rejectReasonPlaceholder}
          aria-label={d.rejectReasonPlaceholder}
          className="h-10 w-56 text-xs"
        />
        <Button size="md" variant="success" disabled={pending} onClick={() => run(() => reviewOrganizer(id, "VERIFIED"))}>
          {d.verify}
        </Button>
        <Button size="md" variant="outline" disabled={pending} onClick={() => { if (!window.confirm(dict.confirm.reject)) return; run(() => reviewOrganizer(id, "REJECTED", note)); }}>
          {d.reject}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{dict.common.actionError}</p>}
    </div>
  );
}

export function ComplaintActions({ id, locale = DEFAULT_LOCALE }: { id: string; locale?: Locale }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const dict = getDictionary(locale);
  const d = dict.moderation;
  const run = (fn: () => Promise<unknown>) => {
    setError(false);
    start(async () => {
      try { await fn(); } catch { setError(true); }
    });
  };
  return (
    <div>
      <div className="flex gap-2">
        <Button size="md" variant="success" disabled={pending} onClick={() => run(() => resolveComplaint(id, "resolved"))}>
          {d.resolve}
        </Button>
        <Button size="md" variant="outline" disabled={pending} onClick={() => run(() => resolveComplaint(id, "dismissed"))}>
          {d.reject}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{dict.common.actionError}</p>}
    </div>
  );
}
