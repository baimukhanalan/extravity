import { Check, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { choosePlan } from "@/app/actions/misc";
import { Card, Badge } from "@/components/ui";
import { formatKzt } from "@/lib/utils";
import { getT } from "@/lib/locale";
import { PlanSubmitButton } from "./plan-submit-button";
import { isPaidCheckoutAvailable, isPaymentProviderLive } from "@/lib/payments";
import styles from "../portal-pages.module.css";

export default async function SubscriptionPage() {
  const { t } = await getT();
  const FEATURES: Record<string, string[]> = {
    free: [t.subscription.featFreeCatalog, t.subscription.featFreeSaves, t.subscription.featFreeCalendar, t.subscription.featFreePortfolio],
    pro_search: [t.subscription.featProRecs, t.subscription.featProNotif, t.subscription.featProMatch, t.subscription.featProRadar],
  };
  const user = await requireUser();
  const paidCheckoutAvailable = isPaidCheckoutAvailable();
  const paymentProviderLive = isPaymentProviderLive();
  const [plans, sub] = await Promise.all([
    prisma.subscriptionPlan.findMany({ where: { slug: { in: ["free", "pro_search"] } }, orderBy: { order: "asc" } }),
    prisma.subscription.findUnique({ where: { userId: user.id }, include: { plan: true } }),
  ]);
  const currentSlug = sub?.plan.slug ?? "free";

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{t.subscription.title}</h1>
          <p className={styles.subtitle}>
            {t.subscription.currentPlanLabel} <span className="font-medium text-foreground">{sub?.plan.name ?? "Free"}</span>
          </p>
        </div>
      </div>

      {!paymentProviderLive ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{paidCheckoutAvailable ? t.subscription.demoNotice : "Платные подписки временно недоступны: эквайринг ещё не подключён."}</span>
        </div>
      ) : null}

      <div className={styles.planGrid}>
        {plans.map((plan) => {
          const active = plan.slug === currentSlug;
          return (
            <Card key={plan.id} className={`${styles.planCard} ${styles.storySection} ${active ? "border-primary ring-1 ring-primary" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{plan.name}</h2>
                {active && <Badge tone="primary">{t.subscription.active}</Badge>}
              </div>
              <p className="mt-2 text-2xl font-semibold">
                {plan.priceKzt === 0 ? "0 ₸" : formatKzt(plan.priceKzt)}
                {plan.priceKzt > 0 && <span className="text-sm font-normal text-muted">{t.subscription.perMonth}</span>}
              </p>
              <ul className="mt-4 flex-1 space-y-2">
                {(FEATURES[plan.slug] ?? []).map((f) => (
                  <li key={f} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {f}</li>
                ))}
              </ul>
              <form action={choosePlan.bind(null, plan.slug)} className="mt-5">
                <PlanSubmitButton
                  label={active ? t.subscription.currentPlanBtn : plan.priceKzt === 0 ? t.subscription.switchToFree : t.subscription.chooseDemo}
                  variant={active ? "outline" : "primary"}
                  disabled={active || (plan.priceKzt > 0 && !paidCheckoutAvailable)}
                />
              </form>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
