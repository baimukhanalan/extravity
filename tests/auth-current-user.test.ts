import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  jwtVerify: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: "signed-session" }) }),
}));
vi.mock("jose", () => ({ jwtVerify: mocks.jwtVerify }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { getCurrentUser } from "@/lib/auth";

describe("current user session boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "test-secret";
    mocks.jwtVerify.mockResolvedValue({ payload: { userId: "user-1", role: "STUDENT", email: "user@example.com" } });
  });

  it("returns an active account", async () => {
    const user = { id: "user-1", isActive: true, deletedAt: null };
    mocks.findUnique.mockResolvedValue(user);

    await expect(getCurrentUser()).resolves.toEqual(user);
  });

  it.each([
    { isActive: false, deletedAt: null },
    { isActive: true, deletedAt: new Date("2026-01-01T00:00:00.000Z") },
  ])("rejects an inactive or deleted account despite a signed session", async (state) => {
    mocks.findUnique.mockResolvedValue({ id: "user-1", ...state });

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});
