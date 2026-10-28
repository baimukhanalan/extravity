import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CreateOpportunityForm } from "@/components/create-opportunity-form";
import { getT } from "@/lib/locale";

export default async function NewOpportunityPage() {
  const { t, locale } = await getT();
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/opportunities" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t.adminOpps.backToList}
      </Link>
      <h1 className="text-2xl font-semibold">{t.adminOpps.newTitle}</h1>
      <p className="mt-1 text-muted">{t.adminOpps.newSubtitle}</p>
      <div className="mt-6">
        <CreateOpportunityForm locale={locale} />
      </div>
    </div>
  );
}
