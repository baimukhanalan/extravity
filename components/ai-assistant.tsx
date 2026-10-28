"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2, Check, X, Pencil, RotateCcw } from "lucide-react";
import { generateDraft, acceptGeneration, rejectGeneration, type AiGenResult } from "@/app/actions/ai";
import type { PromptType } from "@/lib/ai";
import { Card, Button, Select, Textarea, Badge } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, interpolate, type Locale } from "@/lib/i18n";

const TYPE_VALUES: PromptType[] = [
  "motivation_letter", "cv_adapt", "checklist", "interview_prep", "essay_feedback", "shorten",
];

type Version = { id: string; version: number; text: string; model: string };

export function AiAssistant({ applicationId, locale = DEFAULT_LOCALE }: { applicationId: string; locale?: Locale }) {
  const d = getDictionary(locale);
  const typeLabels: Record<PromptType, string> = {
    motivation_letter: d.ai.typeMotivationLetter,
    cv_adapt: d.ai.typeCvAdapt,
    checklist: d.ai.typeChecklist,
    interview_prep: d.ai.typeInterviewPrep,
    essay_feedback: d.ai.typeEssayFeedback,
    shorten: d.ai.typeShorten,
  };
  const [promptType, setPromptType] = useState<PromptType>("motivation_letter");
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Version | null>(null);
  const [history, setHistory] = useState<Version[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [accepted, setAccepted] = useState(false);

  function generate() {
    setError(null);
    setAccepted(false);
    start(async () => {
      const res: AiGenResult = await generateDraft(applicationId, promptType, input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const v: Version = { id: res.id, version: res.version, text: res.output, model: res.model };
      setCurrent(v);
      setDraft(res.output);
      setHistory((h) => [v, ...h]);
      setEditing(false);
    });
  }

  function accept() {
    if (!current) return;
    start(async () => {
      await acceptGeneration(current.id, editing ? draft : current.text, editing);
      setAccepted(true);
    });
  }

  function reject() {
    if (!current) return;
    start(async () => {
      await rejectGeneration(current.id);
      setCurrent(null);
      setAccepted(false);
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">{d.ai.title}</h2>
        <Badge tone="muted">{d.ai.badge}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        {d.ai.hint}
      </p>

      <div className="mt-3 space-y-2">
        <Select value={promptType} onChange={(e) => setPromptType(e.target.value as PromptType)} aria-label={d.achievements.type}>
          {TYPE_VALUES.map((v) => <option key={v} value={v}>{typeLabels[v]}</option>)}
        </Select>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={d.ai.inputPlaceholder}
          className="min-h-24"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={generate} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {d.ai.generate}
          </Button>
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {current && (
        <div className="mt-4 rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted">{interpolate(d.ai.version, { version: current.version })} · {current.model === "mock" ? d.ai.mockModel : current.model}</span>
            {accepted && <Badge tone="success"><Check className="h-3.5 w-3.5" /> {d.ai.accepted}</Badge>}
          </div>
          {editing ? (
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-40 break-words text-sm" />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground">{current.text}</pre>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="success" onClick={accept} disabled={pending}><Check className="h-4 w-4" /> {d.ai.accept}</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}><Pencil className="h-4 w-4" /> {editing ? d.ai.done : d.ai.edit}</Button>
            <Button size="sm" variant="ghost" onClick={reject}><X className="h-4 w-4" /> {d.ai.reject}</Button>
          </div>
        </div>
      )}

      {history.length > 1 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted">{d.ai.versionHistory}</p>
          <div className="mt-1 space-y-1">
            {history.map((v) => (
              <button
                key={v.id}
                onClick={() => { setCurrent(v); setDraft(v.text); setEditing(false); setAccepted(false); }}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-muted hover:bg-surface-muted"
              >
                <RotateCcw className="h-3 w-3" /> {interpolate(d.ai.version, { version: v.version })} — {v.text.slice(0, 40)}…
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
