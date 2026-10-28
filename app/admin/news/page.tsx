import { ArrowUpRight, Newspaper } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { newsTopicLabel } from "@/lib/news";
import { getT } from "@/lib/locale";
import { reviewNewsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminNewsPage() {
  const [{ locale }, items] = await Promise.all([
    getT(),
    prisma.newsArticle.findMany({ where: { status: "PENDING_REVIEW" }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return <div>
    <h1 className="text-2xl font-semibold">{locale === "en" ? "News review" : locale === "kk" ? "Жаңалықтарды тексеру" : "Проверка новостей"}</h1>
    <p className="mt-2 text-sm text-muted">{locale === "en" ? "Check accuracy, attribution and the short summary before publishing. Images remain hidden until rights are cleared." : locale === "kk" ? "Жарияламас бұрын деректерді, дереккөзді және қысқа мазмұнды тексеріңіз. Құқықтары анықталмаған суреттер көрсетілмейді." : "Перед публикацией проверьте факты, первоисточник и краткий пересказ. Изображения без подтверждённых прав не показываются."}</p>
    {items.length === 0 ? <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted"><Newspaper className="mx-auto mb-3 h-8 w-8" />{locale === "en" ? "Nothing to review" : locale === "kk" ? "Тексеруге жаңалық жоқ" : "Новостей на проверке нет"}</div> : <div className="mt-7 space-y-4">{items.map((item) => <article key={item.id} className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted"><span>{newsTopicLabel(item.topic, locale)}</span><span>·</span><span>{item.sourceName}</span><span>·</span><time dateTime={item.publishedAt.toISOString()}>{new Intl.DateTimeFormat(locale).format(item.publishedAt)}</time></div>
      <h2 className="font-semibold">{item.title}</h2><p className="mt-2 whitespace-pre-line text-sm text-muted">{item.summary}</p>
      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">{locale === "en" ? "Original" : locale === "kk" ? "Түпнұсқа" : "Первоисточник"}<ArrowUpRight className="h-4 w-4" /></a>
      <form action={reviewNewsAction} className="mt-5 flex flex-wrap gap-2"><input type="hidden" name="id" value={item.id} /><button name="decision" value="PUBLISHED" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{locale === "en" ? "Publish" : locale === "kk" ? "Жариялау" : "Опубликовать"}</button><button name="decision" value="REJECTED" className="rounded-lg border border-border px-4 py-2 text-sm">{locale === "en" ? "Reject" : locale === "kk" ? "Қабылдамау" : "Отклонить"}</button></form>
    </article>)}</div>}
  </div>;
}
