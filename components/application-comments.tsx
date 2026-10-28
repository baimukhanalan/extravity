"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Send, Trash2, Loader2 } from "lucide-react";
import { addApplicationComment, deleteApplicationComment } from "@/app/actions/application-comments";
import { Card, Button, Textarea, Badge } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { DEFAULT_LOCALE, getDictionary, interpolate, type Locale } from "@/lib/i18n";

export type CommentItem = {
  id: string;
  body: string;
  authorRole: string;
  authorName: string;
  createdAt: string;
  own: boolean;
};

export function ApplicationComments({
  applicationId,
  comments,
  locale = DEFAULT_LOCALE,
}: {
  applicationId: string;
  comments: CommentItem[];
  locale?: Locale;
}) {
  const d = getDictionary(locale);
  const roleLabel: Record<string, string> = {
    student: d.applications.roleStudent,
    counselor: d.applications.roleCounselor,
    parent: d.applications.roleParent,
  };
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      const res = await addApplicationComment(applicationId, text);
      if (res?.error) setError(res.error);
      else {
        setBody("");
        setError(null);
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">{interpolate(d.applications.commentsTitle, { count: comments.length })}</h2>
      </div>
      <p className="mt-1 text-xs text-muted">
        {d.applications.commentsHint}
      </p>

      <div className="mt-4 space-y-3">
        {comments.length === 0 ? (
          <p className="text-sm text-muted">{d.applications.commentsEmpty}</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={c.authorRole === "student" ? "neutral" : "primary"}>
                    {roleLabel[c.authorRole] ?? c.authorRole}
                  </Badge>
                  <span className="text-xs text-muted">{c.authorName} · {formatDate(c.createdAt)}</span>
                </div>
                {c.own && (
                  <button
                    onClick={() => {
                      if (!window.confirm(d.confirm.delete)) return;
                      start(() => deleteApplicationComment(c.id).then(() => router.refresh()));
                    }}
                    disabled={pending}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-danger disabled:opacity-50"
                    aria-label={d.applications.delete}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{c.body}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={d.applications.commentPlaceholder}
          className="min-h-20"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {d.applications.send}
          </Button>
        </div>
      </div>
    </Card>
  );
}
