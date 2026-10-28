import "server-only";
import { randomUUID } from "crypto";

/**
 * Error reporting and product analytics over plain HTTP — no SDK dependencies,
 * so the bundle stays small and both are pure no-ops until the keys exist.
 *
 * SENTRY_DSN            → errors go to Sentry's envelope endpoint
 * NEXT_PUBLIC_POSTHOG_KEY → events go to PostHog's capture endpoint
 */

type SentryTarget = { url: string; key: string };

function parseDsn(dsn: string): SentryTarget | null {
  // https://<key>@<host>/<projectId>
  const match = /^https:\/\/([^@]+)@([^/]+)\/(.+)$/.exec(dsn.trim());
  if (!match) return null;
  const [, key, host, projectId] = match;
  return { url: `https://${host}/api/${projectId}/envelope/`, key };
}

export async function captureError(error: unknown, context: Record<string, unknown> = {}): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error("[error]", message, context, stack);

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const target = parseDsn(dsn);
  if (!target) {
    console.warn("[sentry] SENTRY_DSN is malformed — errors are only logged");
    return;
  }

  const eventId = randomUUID().replace(/-/g, "");
  const sentAt = new Date().toISOString();
  const event = {
    event_id: eventId,
    timestamp: sentAt,
    platform: "node",
    level: "error",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    exception: {
      values: [{ type: error instanceof Error ? error.name : "Error", value: message, stacktrace: undefined }],
    },
    extra: { ...context, stack },
  };

  const body =
    `${JSON.stringify({ event_id: eventId, sent_at: sentAt, dsn })}\n` +
    `${JSON.stringify({ type: "event" })}\n` +
    `${JSON.stringify(event)}\n`;

  try {
    await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=eckz/1.0`,
      },
      body,
    });
  } catch (e) {
    console.error("[sentry] send failed", e);
  }
}

/* ---------------- Product analytics ---------------- */

export type AnalyticsEvent =
  | "opportunity_viewed"
  | "opportunity_saved"
  | "application_started"
  | "application_submitted"
  | "search_performed"
  | "onboarding_completed"
  | "organizer_registered"
  | "counselor_invited_student"
  | "payment_initiated"
  | "payment_succeeded";

/** Fire-and-forget: analytics must never slow down or break a request. */
export async function track(
  event: AnalyticsEvent,
  distinctId: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: "eckz-server" },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error("[analytics] capture failed", e);
  }
}
