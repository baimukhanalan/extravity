"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2, Plus, ShieldCheck, Download, Loader2 } from "lucide-react";
import { deleteDocument } from "@/app/actions/documents";
import { Card, Button, Input, Label, Select, Badge, EmptyState } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, interpolate, type Locale } from "@/lib/i18n";
import { normalizeDocumentType } from "@/lib/document-types";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx";

type Doc = { id: string; name: string; type: string; isMock: boolean; sizeBytes: number };

export function DocumentsManager({ docs, storageReady, locale = DEFAULT_LOCALE }: { docs: Doc[]; storageReady: boolean; locale?: Locale }) {
  const d = getDictionary(locale);
  const DOC_TYPES = [
    { value: "cv", label: d.documents.typeCv },
    { value: "student_id", label: d.documents.typeStudentId },
    { value: "passport", label: d.documents.typePassport },
    { value: "photo", label: d.documents.typePhoto },
    { value: "certificate", label: d.documents.typeCertificate },
    { value: "diploma", label: d.documents.typeDiploma },
    { value: "transcript", label: d.documents.typeTranscript },
    { value: "recommendation", label: d.documents.typeRecommendation },
    { value: "motivation_letter", label: d.documents.typeMotivation },
    { value: "parental_consent", label: d.documents.typeParentalConsent },
    { value: "project_presentation", label: d.documents.typeProjectPresentation },
    { value: "portfolio", label: d.documents.typePortfolio },
  ];

  function formatSize(bytes: number): string {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return interpolate(d.documents.sizeKb, { n: Math.round(bytes / 1024) });
    return interpolate(d.documents.sizeMb, { n: (bytes / 1024 / 1024).toFixed(1) });
  }

  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function onDelete(id: string) {
    if (!window.confirm(d.confirm.delete)) return;
    startTransition(() => deleteDocument(id));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(d.documents.errChooseFile);
      return;
    }
    data.set("file", file);

    setUploading(true);
    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: data });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? d.documents.errUploadFailed);
        return;
      }
      form.reset();
      setOpen(false);
      router.refresh();
    } catch {
      setError(d.documents.errNetwork);
    } finally {
      setUploading(false);
    }
  }

  const typeLabel = (value: string) => DOC_TYPES.find((dt) => dt.value === normalizeDocumentType(value))?.label ?? value;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          {storageReady ? d.documents.privacyReady : d.documents.privacyNotReady}
        </span>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setOpen((v) => !v)} size="sm">
          <Plus className="h-4 w-4" /> {d.documents.addDocument}
        </Button>
      </div>

      {open && (
        <Card className="p-5">
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">{d.documents.fieldName}</Label>
                <Input id="name" name="name" placeholder={d.documents.namePlaceholder} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type">{d.documents.fieldType}</Label>
                <Select id="type" name="type" defaultValue="cv">
                  {DOC_TYPES.map((dt) => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file">{d.documents.fieldFile}</Label>
              <input
                id="file"
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                required
                className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-foreground"
              />
              <p className="text-xs text-muted">{d.documents.fileHint}</p>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {d.common.save}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {docs.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title={d.documents.emptyTitle}
          description={d.documents.emptyDescription}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {docs.map((doc) => (
            <Card key={doc.id} className="flex items-center justify-between p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
                  <FileText className="h-5 w-5 text-muted" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{doc.name}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-xs text-muted">
                      {typeLabel(doc.type)}
                      {doc.sizeBytes ? ` · ${formatSize(doc.sizeBytes)}` : ""}
                    </span>
                    {doc.isMock && <Badge tone="muted">{d.documents.noFile}</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {!doc.isMock && (
                  <a
                    href={`/api/documents/${doc.id}`}
                    className="rounded-md p-2 text-muted hover:text-primary"
                    aria-label={d.documents.downloadAria}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                <button
                  onClick={() => onDelete(doc.id)}
                  disabled={pending}
                  className="rounded-md p-2 text-muted hover:text-danger disabled:opacity-50"
                  aria-label={d.cabinet.deleteAria}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
