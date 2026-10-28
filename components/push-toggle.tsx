"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n";

/**
 * Web Push opt-in. Registers the service worker, asks permission, subscribes via
 * the browser Push API and stores the subscription server-side. Rendered only
 * when a VAPID public key is present (the parent passes it), so it never shows a
 * button that can't work.
 */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushToggle({ vapidPublicKey, locale = DEFAULT_LOCALE }: { vapidPublicKey: string; locale?: Locale }) {
  const d = getDictionary(locale);
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // Async so capability + existing-subscription checks aren't a synchronous
    // setState in the effect body (which React flags as cascading renders).
    (async () => {
      await Promise.resolve();
      const ok = "serviceWorker" in navigator && "PushManager" in window;
      if (!active) return;
      setSupported(ok);
      if (!ok) return;
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (active) setSubscribed(!!sub);
      } catch {
        // No SW yet / not subscribed — the default state is already correct.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(d.notifications.pushPermissionDenied);
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Copy into a fresh ArrayBuffer so the type is BufferSource, not
        // Uint8Array<ArrayBufferLike> (which TS won't accept here).
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).slice(),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) {
        setError(d.notifications.pushSaveFailed);
        return;
      }
      setSubscribed(true);
    } catch {
      setError(d.notifications.pushEnableFailed);
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setError(d.notifications.pushDisableFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return <p className="text-xs text-muted">{d.notifications.pushUnsupported}</p>;
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        variant={subscribed ? "outline" : "primary"}
        disabled={busy}
        onClick={subscribed ? unsubscribe : subscribe}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : subscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {subscribed ? d.notifications.pushOff : d.notifications.pushOn}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
