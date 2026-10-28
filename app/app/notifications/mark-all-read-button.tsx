"use client";

import { useFormStatus } from "react-dom";
import { CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";

export function MarkAllReadButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button variant="outline" size="sm" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />} {label}
    </Button>
  );
}
