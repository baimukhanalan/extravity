import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn().mockResolvedValue({
    id: "link-1",
    inviteToken: "token-1",
    status: "pending",
    studentEmail: "student@example.com",
    studentUserId: null,
    counselor: { userId: "counselor-user" },
  }),
  updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  notify: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    counselorStudentLink: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
    auditLog: { create: mocks.auditCreate },
  },
}));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "student-user", email: "student@example.com" }),
  requireCounselor: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({
  notify: mocks.notify,
  sendEmail: vi.fn(),
}));
vi.mock("@/lib/locale", () => ({
  getT: vi.fn().mockResolvedValue({ t: { actB: {} } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { respondToCounselorInvite } from "@/app/actions/counselor";

describe("counselor invite consumption", () => {
  it("does not overwrite a concurrently revoked invite", async () => {
    await expect(respondToCounselorInvite("token-1", true)).resolves.toEqual({ ok: false });

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "link-1", inviteToken: "token-1", status: "pending" }),
    }));
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
