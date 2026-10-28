import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

/**
 * Payment provider abstraction. Kazakhstani acquirers (Halyk, Kaspi,
 * CloudPayments) all follow the same shape: create a payment, redirect the
 * user, settle via a signed webhook. Until a contract is signed the mock
 * provider settles instantly so the subscription flow is testable end-to-end.
 */

export type PaymentProviderName = "mock" | "halyk" | "kaspi" | "cloudpayments";

export type CreatePaymentInput = {
  paymentId: string;
  amountKzt: number;
  description: string;
  returnUrl: string;
  email: string;
};

export type CreatePaymentResult = {
  /** Where to send the user. The mock provider returns the return URL directly. */
  redirectUrl: string;
  providerRef: string;
};

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  create(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Verifies webhook authenticity. Never trust an unsigned callback. */
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  parseWebhook(rawBody: string): { providerRef: string; status: "succeeded" | "failed" | "refunded" } | null;
}

function hmacSha256Base64(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const mockProvider: PaymentProvider = {
  name: "mock",
  async create(input) {
    return { redirectUrl: input.returnUrl, providerRef: `mock_${randomUUID()}` };
  },
  verifyWebhook() {
    // Mock callbacks are only reachable in non-production setups.
    return process.env.NODE_ENV !== "production";
  },
  parseWebhook(rawBody) {
    try {
      const body = JSON.parse(rawBody) as { providerRef?: string; status?: string };
      if (!body.providerRef) return null;
      const status = body.status === "failed" ? "failed" : body.status === "refunded" ? "refunded" : "succeeded";
      return { providerRef: body.providerRef, status };
    } catch {
      return null;
    }
  },
};

/**
 * CloudPayments-shaped provider: HMAC-SHA256 of the raw body in
 * `Content-HMAC`. Halyk and Kaspi use the same envelope with different
 * field names, so they reuse this implementation once endpoints are known.
 */
function hmacProvider(name: PaymentProviderName): PaymentProvider {
  return {
    name,
    async create(input) {
      const endpoint = process.env.PAYMENT_API_URL;
      const publicId = process.env.PAYMENT_PUBLIC_ID;
      const secret = process.env.PAYMENT_SECRET;
      if (!endpoint || !publicId || !secret) {
        throw new Error("Payment provider is selected but PAYMENT_API_URL/PUBLIC_ID/SECRET are missing");
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${publicId}:${secret}`).toString("base64")}`,
        },
        body: JSON.stringify({
          Amount: input.amountKzt,
          Currency: "KZT",
          Description: input.description,
          InvoiceId: input.paymentId,
          Email: input.email,
          SuccessRedirectUrl: input.returnUrl,
          FailRedirectUrl: input.returnUrl,
        }),
      });
      if (!res.ok) throw new Error(`Payment create failed: ${res.status}`);

      const json = (await res.json()) as { Model?: { Id?: string; Url?: string } };
      const providerRef = json.Model?.Id;
      const redirectUrl = json.Model?.Url;
      if (!providerRef || !redirectUrl) throw new Error("Payment provider returned an unexpected payload");
      return { providerRef, redirectUrl };
    },
    verifyWebhook(rawBody, signature) {
      const secret = process.env.PAYMENT_SECRET;
      if (!secret || !signature) return false;
      return safeEqual(hmacSha256Base64(secret, rawBody), signature);
    },
    parseWebhook(rawBody) {
      try {
        const body = JSON.parse(rawBody) as { TransactionId?: string | number; Status?: string };
        if (body.TransactionId === undefined) return null;
        // Fail CLOSED: only an explicit success value counts as paid. Anything
        // else (Cancelled, Pending, Authorized-but-not-captured, empty, unknown)
        // is treated as failed so an abandoned/half-finished payment can never
        // silently activate a subscription.
        const s = (body.Status || "").toLowerCase();
        const status: "succeeded" | "failed" | "refunded" =
          s === "refunded"
            ? "refunded"
            : ["completed", "success", "succeeded", "paid", "captured"].includes(s)
              ? "succeeded"
              : "failed";
        return { providerRef: String(body.TransactionId), status };
      } catch {
        return null;
      }
    },
  };
}

export function getPaymentProvider(): PaymentProvider {
  const name = (process.env.PAYMENT_PROVIDER || "mock") as PaymentProviderName;
  if (name === "mock") return mockProvider;
  return hmacProvider(name);
}

export function isPaymentProviderLive(): boolean {
  return getPaymentProvider().name !== "mock";
}

export function isPaidCheckoutAvailable(): boolean {
  return isPaymentProviderLive() || process.env.NODE_ENV !== "production";
}
