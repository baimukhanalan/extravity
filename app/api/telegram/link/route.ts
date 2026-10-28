import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueTelegramLinkToken } from "@/lib/telegram-link";

const BOT_USERNAME = /^[A-Za-z0-9_]{5,32}$/;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.isActive || user.deletedAt) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const botName = process.env.TELEGRAM_BOT_USERNAME;
  if (!botName || !BOT_USERNAME.test(botName)) {
    return NextResponse.json({ error: "Telegram bot is not configured" }, { status: 503 });
  }

  const issued = issueTelegramLinkToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramLinkTokenHash: issued.tokenHash,
      telegramLinkTokenExpiresAt: issued.expiresAt,
    },
  });

  return NextResponse.redirect(`https://t.me/${botName}?start=${issued.token}`);
}
