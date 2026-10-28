"use client";

import { useState, useTransition } from "react";
import { toggleFeatureFlag } from "@/app/actions/admin";

export function FlagToggle({ flagKey, enabled, label }: { flagKey: string; enabled: boolean; label?: string }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();

  function toggle() {
    setOn((v) => !v);
    start(async () => {
      try {
        await toggleFeatureFlag(flagKey);
      } catch {
        setOn((v) => !v);
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      role="switch"
      aria-checked={on}
      aria-label={label ?? flagKey}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? "bg-primary" : "bg-border"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}
