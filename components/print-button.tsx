"use client";

import { Download } from "lucide-react";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui";

export function PrintButton({ label, locale = DEFAULT_LOCALE }: { label?: string; locale?: Locale }) {
  const d = getDictionary(locale);
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Download className="h-4 w-4" /> {label ?? d.portfolio.exportPdf}
    </Button>
  );
}
