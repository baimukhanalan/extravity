"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { loginAction, signupAction, type AuthState } from "@/app/actions/auth";
import { Button, Input, Label } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label}
    </Button>
  );
}

export function AuthForm({
  mode,
  locale = DEFAULT_LOCALE,
  next = null,
}: {
  mode: "login" | "signup";
  locale?: Locale;
  next?: string | null;
}) {
  const t = getDictionary(locale).auth;
  const action = mode === "login" ? loginAction : signupAction;
  const [state, formAction] = useActionState<AuthState, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {mode === "signup" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">{t.firstName}</Label>
            <Input id="firstName" name="firstName" placeholder={t.firstNamePlaceholder} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">{t.lastName}</Label>
            <Input id="lastName" name="lastName" placeholder={t.lastNamePlaceholder} required />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">{t.email}</Label>
        <Input id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{t.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder={mode === "signup" ? t.passwordHint : "••••••••"}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
      </div>

      {state?.error && (
        <div className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <SubmitButton label={mode === "login" ? t.submitLogin : t.submitSignup} />

      <p className="text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            {t.noAccount}{" "}
            <Link href={next ? `/signup?${new URLSearchParams({ next })}` : "/signup"} className="font-medium text-primary hover:underline">
              {t.submitSignup}
            </Link>
          </>
        ) : (
          <>
            {t.haveAccount}{" "}
            <Link href={next ? `/login?${new URLSearchParams({ next })}` : "/login"} className="font-medium text-primary hover:underline">
              {t.submitLogin}
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
