"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

/**
 * Reads the current theme straight from the <html> class the anti-FOUC script
 * set, via useSyncExternalStore. This avoids the "setState in an effect" pattern
 * (which flashes and is flagged by the linter) and stays correct through
 * hydration: the server snapshot is always "light", the client reads the real
 * class, and React reconciles without a manual effect.
 */

function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle({ className = "", locale = DEFAULT_LOCALE }: { className?: string; locale?: Locale }) {
  // Server snapshot is false; the mismatch is resolved on the first client read.
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private mode / storage disabled — the class change still applies.
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={getDictionary(locale).common.toggleTheme}
      suppressHydrationWarning
      className={cn("text-muted hover:text-foreground", className)}
    >
      {dark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
    </Button>
  );
}
