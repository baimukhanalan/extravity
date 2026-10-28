import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "crypto";
import { getPaymentProvider, isPaidCheckoutAvailable, isPaymentProviderLive } from "@/lib/payments";

const ENV = ["PAYMENT_PROVIDER", "PAYMENT_SECRET"] as const;

describe("payment provider selection", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV) saved[key] = process.env[key];
  });

  it("fails closed for paid checkout with the mock provider in production", () => {
    process.env.PAYMENT_PROVIDER = "mock";
    vi.stubEnv("NODE_ENV", "production");
    expect(isPaidCheckoutAvailable()).toBe(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const key of ENV) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("defaults to the mock provider", () => {
    delete process.env.PAYMENT_PROVIDER;
    expect(getPaymentProvider().name).toBe("mock");
    expect(isPaymentProviderLive()).toBe(false);
  });

  it("selects a real provider when configured", () => {
    process.env.PAYMENT_PROVIDER = "cloudpayments";
    expect(getPaymentProvider().name).toBe("cloudpayments");
    expect(isPaymentProviderLive()).toBe(true);
  });

  it("mock settles instantly and returns the return URL", async () => {
    delete process.env.PAYMENT_PROVIDER;
    const result = await getPaymentProvider().create({
      paymentId: "p1",
      amountKzt: 2990,
      description: "Pro",
      returnUrl: "https://example.kz/app/subscription",
      email: "a@b.kz",
    });
    expect(result.redirectUrl).toBe("https://example.kz/app/subscription");
    expect(result.providerRef.startsWith("mock_")).toBe(true);
  });
});

describe("webhook signature verification", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV) saved[key] = process.env[key];
    process.env.PAYMENT_PROVIDER = "cloudpayments";
    process.env.PAYMENT_SECRET = "top-secret";
  });

  afterEach(() => {
    for (const key of ENV) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  const body = JSON.stringify({ TransactionId: 12345, Status: "Completed" });
  const sign = (payload: string, secret: string) =>
    createHmac("sha256", secret).update(payload, "utf8").digest("base64");

  it("accepts a correctly signed body", () => {
    const provider = getPaymentProvider();
    expect(provider.verifyWebhook(body, sign(body, "top-secret"))).toBe(true);
  });

  it("rejects a body signed with the wrong secret", () => {
    const provider = getPaymentProvider();
    expect(provider.verifyWebhook(body, sign(body, "wrong"))).toBe(false);
  });

  it("rejects a tampered body", () => {
    const provider = getPaymentProvider();
    const signature = sign(body, "top-secret");
    const tampered = JSON.stringify({ TransactionId: 99999, Status: "Completed" });
    expect(provider.verifyWebhook(tampered, signature)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(getPaymentProvider().verifyWebhook(body, null)).toBe(false);
  });

  it("maps provider statuses to internal ones", () => {
    const provider = getPaymentProvider();
    expect(provider.parseWebhook(body)).toEqual({ providerRef: "12345", status: "succeeded" });
    expect(provider.parseWebhook(JSON.stringify({ TransactionId: 1, Status: "Declined" }))?.status).toBe("failed");
    expect(provider.parseWebhook(JSON.stringify({ TransactionId: 1, Status: "Refunded" }))?.status).toBe("refunded");
  });

  it("returns null for an unparseable payload", () => {
    expect(getPaymentProvider().parseWebhook("not json")).toBeNull();
    expect(getPaymentProvider().parseWebhook("{}")).toBeNull();
  });
});
