import "server-only";
import { prisma } from "./prisma";
import { sendPushToUser } from "./push";

/**
 * Notification delivery. In-app is always stored. Telegram/email are dispatched
 * only when the channel is enabled in the user's preferences AND the provider is
 * configured (TELEGRAM_BOT_TOKEN / RESEND_API_KEY). Without a provider key the
 * send is a logged no-op (clearly labelled mock) so the flow works end-to-end
 * and starts delivering the moment keys are added.
 */

export async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.info(`[telegram:mock] -> ${chatId}: ${text}`);
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: false }),
    });
    return res.ok;
  } catch (e) {
    console.error("[telegram] send failed", e);
    return false;
  }
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email:mock] -> ${to}: ${subject}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "Extravity <noreply@extracurriculars.kz>",
        to,
        subject,
        html,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error("[email] send failed", e);
    return false;
  }
}

function inQuietHours(start?: number | null, end?: number | null): boolean {
  if (start == null || end == null) return false;
  const h = new Date().getUTCHours() + 5; // Asia/Almaty (UTC+5), approx
  const hour = ((h % 24) + 24) % 24;
  if (start <= end) return hour >= start && hour < end;
  return hour >= start || hour < end; // wraps midnight
}

export type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
};

export async function notify(input: NotifyInput): Promise<void> {
  // Always store in-app.
  await prisma.notification.create({
    data: { userId: input.userId, type: input.type, title: input.title, body: input.body, link: input.link },
  });

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { notificationPreference: true },
  });
  if (!user) return;

  const pref = user.notificationPreference;
  const quiet = inQuietHours(pref?.quietHoursStart, pref?.quietHoursEnd);
  if (quiet) return; // respect quiet hours for push channels; in-app already stored

  // Titles/bodies carry scraped opportunity names and user text — escape before
  // interpolating into the HTML channels (Telegram parse_mode=HTML / email HTML),
  // otherwise "&", "<", ">" break the markup or are rejected by Telegram.
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = `<b>${esc(input.title)}</b>\n${esc(input.body)}`;

  if ((pref?.telegram ?? false) && user.telegramChatId) {
    await sendTelegram(user.telegramChatId, text);
  }
  if (pref?.email ?? true) {
    await sendEmail(user.email, input.title, `<h3>${esc(input.title)}</h3><p>${esc(input.body)}</p>`);
  }
  // Web push, if the user has subscribed a device (no-op without VAPID keys).
  await sendPushToUser(input.userId, { title: input.title, body: input.body, url: input.link });
}
