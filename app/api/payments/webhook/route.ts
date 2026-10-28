import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPaymentProvider } from "@/lib/payments";
import { notify } from "@/lib/notifications";
import { captureError, track } from "@/lib/observability";
import { DEFAULT_LOCALE, getDictionary, interpolate, isLocale } from "@/lib/i18n";

/**
 * Settlement callback from the acquirer. The signature is checked before
 * anything is read out of the body, and the handler is idempotent — providers
 * retry until they get a 200.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const provider = getPaymentProvider();
  const signature =
    request.headers.get("content-hmac") ??
    request.headers.get("x-content-hmac") ??
    request.headers.get("x-signature");

  if (!provider.verifyWebhook(raw, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const parsed = provider.parseWebhook(raw);
  if (!parsed) return NextResponse.json({ error: "unparseable payload" }, { status: 400 });

  const payment = await prisma.payment.findUnique({
    where: { providerRef: parsed.providerRef },
    include: { user: { select: { id: true, email: true, locale: true } } },
  });
  if (!payment) return NextResponse.json({ error: "unknown payment" }, { status: 404 });

  // Already settled — acknowledge without touching the subscription again.
  if (payment.status === parsed.status) return NextResponse.json({ ok: true, idempotent: true });

  try {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: parsed.status, meta: { raw: raw.slice(0, 4000) } },
    });

    if (parsed.status === "succeeded") {
      const plan = await prisma.subscriptionPlan.findUnique({ where: { slug: payment.planSlug } });
      if (plan) {
        await prisma.subscription.upsert({
          where: { userId: payment.userId },
          create: { userId: payment.userId, planId: plan.id, status: "active" },
          update: { planId: plan.id, status: "active" },
        });
      }
      const d = getDictionary(isLocale(payment.user?.locale) ? payment.user.locale : DEFAULT_LOCALE);
      await notify({
        userId: payment.userId,
        type: "payment_succeeded",
        title: d.apiMsg.paymentSucceededTitle,
        body: interpolate(d.apiMsg.paymentSucceededBody, { plan: payment.planSlug }),
        link: "/app/subscription",
      });
      await track("payment_succeeded", payment.userId, { plan: payment.planSlug, amount: payment.amountKzt });
    } else if (parsed.status === "refunded") {
      await prisma.subscription.updateMany({
        where: { userId: payment.userId },
        data: { status: "cancelled" },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: payment.userId,
        action: "payment_settled",
        entity: "payment",
        entityId: payment.id,
        meta: { status: parsed.status, provider: provider.name },
      },
    });
  } catch (e) {
    await captureError(e, { where: "payments/webhook", paymentId: payment.id });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
