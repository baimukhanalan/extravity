import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegram } from "@/lib/notifications";
import { captureError } from "@/lib/observability";
import { isStaff } from "@/lib/auth";
import { ingestCandidates } from "@/lib/ingest";
import { safeEqual } from "@/lib/timing-safe";
import { hashTelegramLinkToken, isTelegramLinkToken } from "@/lib/telegram-link";
import { extractCandidate, instagramPermalink } from "@/lib/opportunity-extract";
import { DEFAULT_LOCALE, getDictionary, interpolate, isLocale } from "@/lib/i18n";

/**
 * Telegram bot webhook.
 *
 * Handles three things:
 *   `/start <code>`  — link this chat to an account
 *   `/stop`          — unlink
 *   a forwarded post — turn it into a moderation-queue candidate
 *
 * The forwarding path is the low-tech counterpart to the MTProto collector: it
 * works with any channel, needs no admin rights anywhere, and always has a
 * human deciding what gets forwarded in the first place.
 *
 * Setup (after TELEGRAM_BOT_TOKEN exists):
 *   curl -F "url=https://<domain>/api/telegram/webhook" \
 *        -F "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
 *        https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook
 */

type ForwardOrigin = {
  type?: string;
  message_id?: number;
  date?: number;
  chat?: { id?: number; title?: string; username?: string };
  sender_user_name?: string;
  sender_chat?: { title?: string; username?: string };
};

type TelegramUpdate = {
  message?: {
    text?: string;
    caption?: string;
    date?: number;
    chat?: { id?: number };
    from?: { first_name?: string };
    forward_origin?: ForwardOrigin;
    forward_from_chat?: { title?: string; username?: string };
    forward_from_message_id?: number;
  };
};

const HELP =
  "Команды: /start <код> — привязать аккаунт, /stop — отключить уведомления.\n" +
  "Ещё можно переслать сюда пост из Telegram-канала или вставить текст поста Instagram " +
  "со ссылкой (instagram.com/p/...) — я разберу его и отправлю на модерацию.";

function firstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>()[\]«»"]+/i);
  return match ? match[0].replace(/[.,;)]+$/, "") : null;
}

type ForwardSource = {
  /** Canonical permalink used for dedup and as the stored sourceUrl. */
  url: string;
  /** Connector type — drives trust scoring in lib/ingest.ts. */
  type: "telegram_forward" | "instagram_forward";
  organizer: string;
};

function resolveForwardSource(
  message: NonNullable<TelegramUpdate["message"]>,
  text: string,
): ForwardSource | null {
  // A native Telegram forward from a public channel is the strongest signal.
  const tgPermalink = originPermalink(message);
  if (tgPermalink) {
    return { url: tgPermalink, type: "telegram_forward", organizer: originName(message) ?? "Telegram" };
  }
  // Otherwise a pasted Instagram post link.
  const ig = instagramPermalink(text);
  if (ig) return { url: ig, type: "instagram_forward", organizer: "Instagram" };
  // Fall back to any link in the text (pasted Telegram post, a plain URL).
  const any = firstUrl(text);
  if (any) return { url: any, type: "telegram_forward", organizer: originName(message) ?? "Telegram" };
  return null;
}

/** Permalink of the forwarded post when the source channel is public. */
function originPermalink(message: NonNullable<TelegramUpdate["message"]>): string | null {
  const origin = message.forward_origin;
  const username = origin?.chat?.username ?? message.forward_from_chat?.username;
  const messageId = origin?.message_id ?? message.forward_from_message_id;
  return username && messageId ? `https://t.me/${username}/${messageId}` : null;
}

function originName(message: NonNullable<TelegramUpdate["message"]>): string | null {
  const origin = message.forward_origin;
  return (
    origin?.chat?.title ??
    origin?.sender_chat?.title ??
    message.forward_from_chat?.title ??
    null
  );
}

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && !safeEqual(request.headers.get("x-telegram-bot-api-secret-token") ?? "", expected)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const text = (message?.text || message?.caption || "").trim();
  if (!chatId || !text || !message) return NextResponse.json({ ok: true });

  const chat = String(chatId);
  const [command, commandArg] = text.split(/\s+/);
  const isStartCommand = /^\/start(?:@[A-Za-z0-9_]{5,32})?$/i.test(command);
  const isStopCommand = /^\/stop(?:@[A-Za-z0-9_]{5,32})?$/i.test(command);

  try {
    if (isStartCommand) {
      const token = commandArg;
      if (!token) {
        await sendTelegram(
          chat,
          "Чтобы привязать аккаунт, откройте ссылку из раздела «Настройки → Уведомления» на сайте.",
        );
        return NextResponse.json({ ok: true });
      }

      const user = isTelegramLinkToken(token)
        ? await prisma.user.findFirst({
            where: {
              telegramLinkTokenHash: hashTelegramLinkToken(token),
              telegramLinkTokenExpiresAt: { gt: new Date() },
              isActive: true,
              deletedAt: null,
            },
            select: { id: true, locale: true },
          })
        : null;
      if (!user) {
        await sendTelegram(chat, "Ссылка недействительна. Сгенерируйте новую в настройках на сайте.");
        return NextResponse.json({ ok: true });
      }

      const linked = await prisma.$transaction(async (tx) => {
        // PostgreSQL also enforces uniqueness; this detach keeps relinking the
        // same chat to a different account an intentional last-write action.
        await tx.user.updateMany({
          where: { telegramChatId: chat, id: { not: user.id } },
          data: { telegramChatId: null },
        });

        // Consume the credential conditionally so concurrent replays cannot both succeed.
        const claimed = await tx.user.updateMany({
          where: {
            id: user.id,
            telegramLinkTokenHash: hashTelegramLinkToken(token),
            telegramLinkTokenExpiresAt: { gt: new Date() },
          },
          data: {
            telegramChatId: chat,
            telegramLinkTokenHash: null,
            telegramLinkTokenExpiresAt: null,
          },
        });
        if (claimed.count !== 1) return false;

        await tx.notificationPreference.upsert({
          where: { userId: user.id },
          create: { userId: user.id, telegram: true },
          update: { telegram: true },
        });
        return true;
      });

      if (!linked) {
        await sendTelegram(chat, "Ссылка недействительна. Сгенерируйте новую в настройках на сайте.");
        return NextResponse.json({ ok: true });
      }

      const d = getDictionary(isLocale(user.locale) ? user.locale : DEFAULT_LOCALE);
      await sendTelegram(chat, d.apiMsg.botStartLinked);
      return NextResponse.json({ ok: true });
    }

    if (isStopCommand) {
      const user = await prisma.user.findFirst({ where: { telegramChatId: chat } });
      if (user) {
        await prisma.$transaction([
          prisma.user.update({
            where: { id: user.id },
            data: {
              telegramChatId: null,
              telegramLinkTokenHash: null,
              telegramLinkTokenExpiresAt: null,
            },
          }),
          prisma.notificationPreference.upsert({
            where: { userId: user.id },
            create: { userId: user.id, telegram: false },
            update: { telegram: false },
          }),
        ]);
      }
      await sendTelegram(chat, "Уведомления отключены. Чтобы включить снова — /start со ссылкой из настроек.");
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/")) {
      await sendTelegram(chat, HELP);
      return NextResponse.json({ ok: true });
    }

    // --- Forwarded post → moderation queue ---

    const sender = await prisma.user.findFirst({
      where: { telegramChatId: chat, isActive: true, deletedAt: null },
      select: { id: true, role: true, email: true, locale: true },
    });
    if (!sender) {
      await sendTelegram(
        chat,
        "Сначала привяжите аккаунт: откройте «Настройки → Уведомления» на сайте и нажмите «Открыть бота».",
      );
      return NextResponse.json({ ok: true });
    }

    const d = getDictionary(isLocale(sender.locale) ? sender.locale : DEFAULT_LOCALE);

    const source = resolveForwardSource(message, text);
    if (!source) {
      await sendTelegram(chat, d.apiMsg.botForwardNoSource);
      return NextResponse.json({ ok: true });
    }

    // Students get the same route as the website's "Нашёл возможность" form:
    // a submission a moderator reviews, not a catalog entry.
    if (!isStaff(sender.role)) {
      const dupe = await prisma.userSubmission.findFirst({
        where: { url: source.url, status: { in: ["PENDING", "APPROVED"] } },
      });
      if (dupe) {
        await sendTelegram(chat, d.apiMsg.botForwardDuplicateSubmission);
        return NextResponse.json({ ok: true });
      }
      await prisma.userSubmission.create({
        data: { userId: sender.id, url: source.url, comment: text.slice(0, 500) },
      });
      await prisma.auditLog.create({
        data: { userId: sender.id, action: "submission_created_via_bot", entity: "user_submission" },
      });
      await sendTelegram(chat, d.apiMsg.botForwardSubmitted);
      return NextResponse.json({ ok: true });
    }

    const publishedAt = message.forward_origin?.date
      ? new Date(message.forward_origin.date * 1000)
      : message.date
        ? new Date(message.date * 1000)
        : undefined;

    const candidate = extractCandidate({
      text,
      sourceUrl: source.url,
      organizerName: source.organizer,
      publishedAt,
    });

    if (!candidate) {
      await sendTelegram(chat, d.apiMsg.botForwardNotOpportunity);
      return NextResponse.json({ ok: true });
    }

    const platform = source.type === "instagram_forward" ? "Instagram" : "Telegram";
    const result = await ingestCandidates(
      {
        name: `${platform} (пересылка): ${candidate.organizerName}`,
        type: source.type,
        url: source.url,
      },
      [candidate],
    );

    await prisma.auditLog.create({
      data: {
        userId: sender.id,
        action: "forward_ingested",
        entity: "opportunity",
        meta: {
          platform: source.type,
          created: result.created,
          duplicate: result.duplicate,
          failed: result.failed,
        },
      },
    });

    if (result.created > 0) {
      const deadline = candidate.applicationDeadline
        ? new Date(candidate.applicationDeadline).toLocaleDateString("ru-RU")
        : d.apiMsg.botForwardDeadlineNotFound;
      await sendTelegram(
        chat,
        interpolate(d.apiMsg.botForwardQueued, {
          title: candidate.title,
          category: candidate.categorySlug,
          deadline,
          confidence: Math.round((candidate.confidence ?? 0) * 100),
        }),
      );
    } else if (result.duplicate > 0) {
      await sendTelegram(chat, d.apiMsg.botForwardCatalogDuplicate);
    } else {
      await sendTelegram(chat, d.apiMsg.botForwardSaveFailed);
    }
  } catch (e) {
    await captureError(e, { where: "telegram/webhook" });
  }

  return NextResponse.json({ ok: true });
}
