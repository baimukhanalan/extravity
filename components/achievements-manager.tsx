"use client";

import { useActionState, useState, useTransition } from "react";
import { Award, Trash2, Plus } from "lucide-react";
import { addAchievement, deleteAchievement, type AchievementState } from "@/app/actions/achievements";
import { DEFAULT_LOCALE, getDictionary, type Dict, type Locale } from "@/lib/i18n";
import { Card, Button, Input, Label, Select, Textarea, Badge, EmptyState } from "@/components/ui";
import { ACHIEVEMENT_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

type Achievement = {
  id: string; title: string; organization: string | null; type: string;
  date: Date | string | null; role: string | null; description: string | null;
  result: string | null; level: string | null;
};

export function AchievementsManager({ achievements, locale = DEFAULT_LOCALE }: { achievements: Achievement[]; locale?: Locale }) {
  const d = getDictionary(locale);
  const [state, formAction] = useActionState<AchievementState, FormData>(addAchievement, undefined);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setOpen((v) => !v)} size="sm"><Plus className="h-4 w-4" /> {d.achievements.add}</Button>
      </div>

      {open && (
        <Card className="p-5">
          <form action={formAction} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="title">{d.achievements.fieldTitle}</Label>
                <Input id="title" name="title" placeholder={d.achievements.titlePlaceholder} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="organization">{d.achievements.organization}</Label>
                <Input id="organization" name="organization" placeholder={d.achievements.organizationPlaceholder} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type">{d.achievements.type}</Label>
                <Select id="type" name="type" defaultValue="AWARD">
                  {Object.entries(ACHIEVEMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">{d.achievements.date}</Label>
                <Input id="date" name="date" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">{d.achievements.role}</Label>
                <Input id="role" name="role" placeholder={d.achievements.rolePlaceholder} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="level">{d.achievements.level}</Label>
                <Select id="level" name="level" defaultValue="">
                  <option value="">—</option>
                  <option value="school">{d.achievements.levelSchool}</option>
                  <option value="city">{d.achievements.levelCity}</option>
                  <option value="national">{d.achievements.levelNational}</option>
                  <option value="international">{d.achievements.levelInternational}</option>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="result">{d.achievements.result}</Label>
              <Input id="result" name="result" placeholder={d.achievements.resultPlaceholder} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">{d.achievements.description}</Label>
              <Textarea id="description" name="description" placeholder={d.achievements.descriptionPlaceholder} />
            </div>
            {state?.error && <p className="text-sm text-danger">{state.error}</p>}
            <div className="flex justify-end">
              <Button type="submit" size="sm"><Plus className="h-4 w-4" /> {d.achievements.save}</Button>
            </div>
          </form>
        </Card>
      )}

      {achievements.length === 0 ? (
        <EmptyState icon={<Award className="h-8 w-8" />} title={d.achievements.emptyTitle} description={d.achievements.emptyDescription} />
      ) : (
        <div className="space-y-3">
          {achievements.map((a) => (
            <Card key={a.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{a.title}</p>
                  <Badge tone="primary">{ACHIEVEMENT_TYPE_LABELS[a.type] ?? a.type}</Badge>
                  {a.level && <Badge>{levelLabel(a.level, d)}</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {[a.organization, a.role, a.result].filter(Boolean).join(" · ")}
                  {a.date ? ` · ${formatDate(a.date)}` : ""}
                </p>
                {a.description && <p className="mt-1 text-sm text-muted">{a.description}</p>}
              </div>
              <button
                onClick={() => {
                  if (!window.confirm(d.confirm.delete)) return;
                  startTransition(() => deleteAchievement(a.id));
                }}
                disabled={pending}
                className="shrink-0 rounded-md p-2 text-muted hover:text-danger disabled:opacity-50"
                aria-label={d.achievements.delete}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function levelLabel(l: string, d: Dict) {
  return {
    school: d.achievements.levelSchool,
    city: d.achievements.levelCity,
    national: d.achievements.levelNational,
    international: d.achievements.levelInternational,
  }[l] ?? l;
}
