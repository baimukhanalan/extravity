"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getPaymentProvider, isPaidCheckoutAvailable } from "@/lib/payments";
import { captureError, track } from "@/lib/observability";

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });
  revalidatePath("/app/notifications");
  revalidatePath("/app");
}

/**
 * Starts a plan change. Free plans switch immediately; paid ones create a
 * Payment row and hand off to the acquirer, whose webhook activates the
 * subscription. With the mock provider the payment settles right here so the
 * flow stays testable without a contract.
 */
export async function choosePlan(planSlug: string) {
  const user = await requireUser();
  if (!new Set(["free", "pro_search"]).has(planSlug)) return;
  const plan = await prisma.subscriptionPlan.findUnique({ where: { slug: planSlug } });
  if (!plan) return;

  const activate = async () => {
    await prisma.subscription.upsert({
      where: { userId: user.id },
      create: { userId: user.id, planId: plan.id, status: "active" },
      update: { planId: plan.id, status: "active" },
    });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "subscription_changed", entity: "subscription", meta: { plan: planSlug } },
    });
  };

  if (plan.priceKzt === 0) {
    await activate();
    revalidatePath("/app/subscription");
    return;
  }

  if (!isPaidCheckoutAvailable()) {
    await prisma.auditLog.create({
      data: { userId: user.id, action: "paid_checkout_unavailable", entity: "subscription", meta: { plan: planSlug } },
    });
    revalidatePath("/app/subscription");
    return;
  }

  const provider = getPaymentProvider();
  const payment = await prisma.payment.create({
    data: { userId: user.id, planSlug, provider: provider.name, amountKzt: plan.priceKzt, status: "pending" },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let created;
  try {
    created = await provider.create({
      paymentId: payment.id,
      amountKzt: plan.priceKzt,
      description: `Подписка «${plan.name}» — Extravity`,
      returnUrl: `${appUrl}/app/subscription`,
      email: user.email,
    });
  } catch (e) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
    await captureError(e, { where: "choosePlan", planSlug, userId: user.id });
    revalidatePath("/app/subscription");
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerRef: created.providerRef },
  });
  await track("payment_initiated", user.id, { plan: planSlug, amount: plan.priceKzt });

  if (provider.name === "mock") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "succeeded" } });
    await activate();
    revalidatePath("/app/subscription");
    return;
  }

  redirect(created.redirectUrl);
}
