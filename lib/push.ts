import "server-only";
import webpush from "web-push";
import { prisma } from "./prisma";

/**
 * Web Push delivery. Dormant until VAPID keys exist — like every other
 * integration here, the feature degrades to a no-op rather than erroring.
 *
 * Generate keys once:  npx web-push generate-vapid-keys
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (server), plus mirror the public one to
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY so the browser can subscribe.
 */

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function ensureConfigured(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@extracurriculars.kz",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

export type PushPayload = { title: string; body: string; url?: string };

/**
 * Sends a payload to every subscription the user has. Subscriptions the push
 * service rejects as gone (404/410) are pruned so they don't accumulate.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        }
        // Other errors are transient; the next notification retries.
      }
    }),
  );
}
