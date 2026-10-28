import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const getCurrentUser = vi.fn();
const getSession = vi.fn();

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth", () => ({ getCurrentUser, getSession }));
vi.mock("@/lib/locale", () => ({
  getT: vi.fn(async () => ({
    t: {
      authPage: {
        brandHeadline: "headline",
        benefitFeed: "feed",
        benefitDeadlines: "deadlines",
        benefitPack: "pack",
        benefitPortfolio: "portfolio",
        footnote: "footnote",
      },
    },
  })),
}));

describe("auth layout session validation", () => {
  beforeEach(() => {
    redirect.mockClear();
    getCurrentUser.mockReset();
    getSession.mockReset();
  });

  it("redirects an active database user", async () => {
    getCurrentUser.mockResolvedValue({ isActive: true });
    getSession.mockResolvedValue({ userId: "user-1" });
    const { default: AuthLayout } = await import("@/app/(auth)/layout");

    await expect(AuthLayout({ children: null })).rejects.toThrow("REDIRECT:/app");
  });

  it("routes a stale session through the cookie-clearing endpoint", async () => {
    getCurrentUser.mockResolvedValue({ isActive: false });
    getSession.mockResolvedValue({ userId: "user-1" });
    const { default: AuthLayout } = await import("@/app/(auth)/layout");

    await expect(AuthLayout({ children: "login" })).rejects.toThrow("REDIRECT:/api/auth/clear");
  });

  it("renders auth pages when there is no valid session", async () => {
    getSession.mockResolvedValue(null);
    const { default: AuthLayout } = await import("@/app/(auth)/layout");

    const result = await AuthLayout({ children: "login" });
    expect(result).toBeTruthy();
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
