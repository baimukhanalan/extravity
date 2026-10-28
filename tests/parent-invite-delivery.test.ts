import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  linkCreate: vi.fn(),
  linkDeleteMany: vi.fn(),
  linkFindUnique: vi.fn(),
  linkUpdate: vi.fn(),
  consentUpdate: vi.fn(),
  auditCreate: vi.fn(),
  notificationCreate: vi.fn(),
  transaction: vi.fn(),
  sendEmail: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    parentStudentLink: {
      create: mocks.linkCreate,
      deleteMany: mocks.linkDeleteMany,
      findUnique: mocks.linkFindUnique,
      update: mocks.linkUpdate,
    },
    parentConsent: { update: mocks.consentUpdate },
    auditLog: { create: mocks.auditCreate },
    notification: { create: mocks.notificationCreate },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({
    id: "student-1",
    email: "student@example.com",
    studentProfile: { firstName: "<Student>", lastName: "A&B" },
  }),
  requireParent: vi.fn(),
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/notifications", () => ({ sendEmail: mocks.sendEmail, notify: vi.fn() }));
vi.mock("@/lib/locale", () => ({
  getT: vi.fn().mockResolvedValue({
    t: { actB: {
      invalidParentEmail: "invalid email",
      parentInviteEmailSubject: "parent invite",
      parentInviteEmailIntro: "{studentName} asks for consent",
      confirmConsentsViaLink: "confirm using link",
      emailDeliveryFailed: "email delivery failed",
      parentConfirmedConsentsTitle: "confirmed",
      parentUpdatedConsentsBody: "{email} updated consent",
    } },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { inviteParent, submitParentConsent } from "@/app/actions/parent";

describe("parent invitation delivery and account binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.linkCreate.mockResolvedValue({ id: "link-1" });
    mocks.linkDeleteMany.mockResolvedValue({ count: 1 });
    mocks.linkUpdate.mockResolvedValue({});
    mocks.consentUpdate.mockResolvedValue({});
    mocks.auditCreate.mockResolvedValue({});
    mocks.notificationCreate.mockResolvedValue({});
    mocks.transaction.mockResolvedValue([]);
    mocks.sendEmail.mockResolvedValue(true);
    mocks.getCurrentUser.mockResolvedValue(null);
  });

  it("removes an unusable invite if email was not delivered", async () => {
    mocks.sendEmail.mockResolvedValue(false);
    const form = new FormData();
    form.set("parentEmail", "parent@example.com");

    await expect(inviteParent(undefined, form)).resolves.toEqual({ error: "email delivery failed" });
    expect(mocks.linkDeleteMany).toHaveBeenCalledWith({
      where: { id: "link-1", inviteToken: expect.any(String), status: "pending" },
    });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("escapes student details in the invitation email", async () => {
    const form = new FormData();
    form.set("parentEmail", "parent@example.com");

    await expect(inviteParent(undefined, form)).resolves.toEqual({ success: true });
    const html = mocks.sendEmail.mock.calls[0][2] as string;
    expect(html).toContain("&lt;Student&gt; A&amp;B");
    expect(html).not.toContain("<Student>");
  });

  it("does not bind a consent link to an inactive session", async () => {
    mocks.linkFindUnique.mockResolvedValue({
      id: "link-1", parentEmail: "parent@example.com", parentUserId: null,
      studentUserId: "student-1", status: "pending", consents: [],
    });

    await expect(submitParentConsent("invite-token", [])).resolves.toEqual({ ok: true });
    expect(mocks.getCurrentUser).toHaveBeenCalledOnce();
    expect(mocks.linkUpdate).not.toHaveBeenCalledWith(expect.objectContaining({
      data: { parentUserId: expect.any(String) },
    }));
  });

  it("binds only the active account with the invited email", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "parent-1", email: "parent@example.com" });
    mocks.linkFindUnique.mockResolvedValue({
      id: "link-1", parentEmail: "parent@example.com", parentUserId: null,
      studentUserId: "student-1", status: "pending", consents: [],
    });

    await expect(submitParentConsent("invite-token", [])).resolves.toEqual({ ok: true });
    expect(mocks.linkUpdate).toHaveBeenCalledWith({
      where: { id: "link-1" }, data: { parentUserId: "parent-1" },
    });
  });
});
