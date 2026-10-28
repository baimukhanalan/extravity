"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Save, Copy, Check, Loader2 } from "lucide-react";
import type { ApplicationStatus } from "@prisma/client";
import { toggleChecklistItem, updateApplicationStatus, saveApplicationNotes } from "@/app/actions/applications";
import { Card, Badge, Progress, Select, Textarea, Button } from "@/components/ui";
import { AiAssistant } from "@/components/ai-assistant";
import { APPLICATION_STATUS_LABELS } from "@/lib/constants";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";
import { allowedApplicationStatuses } from "@/lib/application-status";

type ChecklistItem = { id: string; label: string; done: boolean };

export function ApplicationWorkspace({
  applicationId, initialChecklist, initialProgress, initialStatus, initialNotes, pack,
  locale = DEFAULT_LOCALE, readOnly = false,
}: {
  applicationId: string;
  initialChecklist: ChecklistItem[];
  initialProgress: number;
  initialStatus: ApplicationStatus;
  initialNotes: string;
  pack: { label: string; value: string }[];
  locale?: Locale;
  readOnly?: boolean;
}) {
  const d = getDictionary(locale);
  const [checklist, setChecklist] = useState(initialChecklist);
  const [progress, setProgress] = useState(initialProgress);
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [, startTransition] = useTransition();
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  function onToggle(id: string) {
    const next = checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c));
    setChecklist(next);
    setProgress(Math.round((next.filter((c) => c.done).length / next.length) * 100));
    startTransition(() => toggleChecklistItem(applicationId, id));
  }

  function onStatus(s: ApplicationStatus) {
    const previous = status;
    setStatusError(null);
    setStatus(s);
    startTransition(async () => {
      const result = await updateApplicationStatus(applicationId, s);
      if (!result.ok) {
        setStatus(previous);
        setStatusError("Статус изменился в другой вкладке. Обновите страницу и повторите.");
      }
    });
  }

  function onSaveNotes() {
    setSavingNotes(true);
    startTransition(async () => {
      await saveApplicationNotes(applicationId, notes);
      setSavingNotes(false);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 1500);
    });
  }

  function copyPack() {
    navigator.clipboard.writeText(pack.map((p) => `${p.label}: ${p.value}`).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{d.applications.checklistTitle}</h2>
            <span className="text-sm text-muted">{progress}%</span>
          </div>
          <Progress value={progress} className="mt-3" />
          <ul className="mt-4 space-y-1">
            {checklist.map((c) => (
              <li key={c.id}>
                <button onClick={() => onToggle(c.id)} disabled={readOnly} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-muted disabled:cursor-default disabled:hover:bg-transparent">
                  {c.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <Circle className="h-5 w-5 shrink-0 text-muted" />}
                  <span className={c.done ? "text-muted line-through" : ""}>{c.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">{d.applications.notesTitle}</h2>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} placeholder={d.applications.notesPlaceholder} className="mt-3 min-h-32" />
          {!readOnly && <div className="mt-3 flex justify-end">
            <Button size="sm" variant="outline" onClick={onSaveNotes} disabled={savingNotes}>
              {savingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : notesSaved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {notesSaved ? d.common.saved : d.applications.save}
            </Button>
          </div>}
        </Card>
        {!readOnly && <AiAssistant applicationId={applicationId} locale={locale} />}
      </div>

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="font-semibold">{d.applications.statusTitle}</h2>
          <Badge tone="primary" className="mt-2">{APPLICATION_STATUS_LABELS[status]}</Badge>
          {!readOnly && <Select value={status} onChange={(e) => onStatus(e.target.value as ApplicationStatus)} className="mt-3" aria-label={d.applications.statusTitle}>
            {[status, ...allowedApplicationStatuses(status)].map((s) => <option key={s} value={s}>{APPLICATION_STATUS_LABELS[s]}</option>)}
          </Select>}
          {statusError ? <p className="mt-2 text-xs text-danger">{statusError}</p> : null}
          <p className="mt-2 text-xs text-muted">{readOnly ? d.applications.historicalNotice : d.applications.statusNote}</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Application Pack</h2>
            <button onClick={copyPack} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? d.applications.copied : d.applications.copy}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">{d.applications.packHint}</p>
          <dl className="mt-3 space-y-2 text-sm">
            {pack.map((p) => <div key={p.label} className="flex justify-between gap-3"><dt className="text-muted">{p.label}</dt><dd className="text-right font-medium">{p.value || "—"}</dd></div>)}
          </dl>
        </Card>
      </div>
    </div>
  );
}
