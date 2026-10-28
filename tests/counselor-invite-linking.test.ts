import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  linkFindUnique: vi.fn().mockResolvedValue(null),
  linkCreate: vi.fn().mockResolvedValue({ id: "link-1" }),
  linkUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
  linkDeleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  profile: { id: "profile-1", fullName: "A Counselor", school: "School" },
  userFindUnique: vi.fn(),
  auditCreate: vi.fn().mockResolvedValue({}),
  sendEmail: vi.fn().mockResolvedValue(true),
  notify: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    counselorStudentLink: {
      findUnique: mocks.linkFindUnique,
      create: mocks.linkCreate,
      updateMany: mocks.linkUpdateMany,
      deleteMany: mocks.linkDeleteMany,
    },
    user: { findUnique: mocks.userFindUnique },
    auditLog: { create: mocks.auditCreate },
  },
}));
vi.mock("@/lib/auth", () => ({
  requireCounselor: vi.fn().mockResolvedValue({
    user: { id: "counselor-user", email: "counselor@example.com" },
    profile: mocks.profile,
  }),
  requireUser: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({
  sendEmail: mocks.sendEmail,
  notify: mocks.notify,
}));
vi.mock("@/lib/locale", () => ({
  getT: vi.fn().mockResolvedValue({
    t: {
      actB: {
        invalidStudentEmail: "invalid email",
        cannotInviteYourself: "cannot invite yourself",
        studentAlreadyInvited: "already invited",
        emailDeliveryFailed: "email delivery failed",
        counselorInviteEmailSubject: "invite",
        counselorInviteEmailIntro: "{name} invites you",
        registerAndAcceptViaLink: "accept via link",
      },
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { inviteStudent } from "@/app/actions/counselor";

describe("counselor invitation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.linkFindUnique.mockResolvedValue(null);
    mocks.linkCreate.mockResolvedValue({ id: "link-1" });
    mocks.linkUpdateMany.mockResolvedValue({ count: 1 });
    mocks.sendEmail.mockResolvedValue(true);
    mocks.profile.fullName = "A Counselor";
    mocks.profile.school = "School";
  });

  it("keeps the invite unbound and delivers its credential by email", async () => {
    const form = new FormData();
    form.set("studentEmail", "Student@Example.com");

    await expect(inviteStudent(undefined, form)).resolves.toEqual({ success: true });

    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.linkCreate.mock.calls[0][0].data).toMatchObject({
      counselorId: "profile-1",
      studentEmail: "student@example.com",
    });
    expect(mocks.linkCreate.mock.calls[0][0].data).not.toHaveProperty("studentUserId");
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("removes an unusable pending invite when email delivery fails", async () => {
    mocks.sendEmail.mockResolvedValueOnce(false);

    const form = new FormData();
    form.set("studentEmail", "student@example.com");
    const result = await inviteStudent(undefined, form);

    expect(result).toEqual({ error: expect.stringContaining("email") });
    expect(mocks.linkDeleteMany).toHaveBeenCalledOnce();
  });

  it("does not email an invitation when a concurrent request already revived the link", async () => {
    mocks.linkFindUnique.mockResolvedValueOnce({
      id: "link-1", status: "revoked", inviteToken: "old-token", note: null,
      studentUserId: null, acceptedAt: null,
    });
    mocks.linkUpdateMany.mockResolvedValueOnce({ count: 0 });
    const form = new FormData();
    form.set("studentEmail", "student@example.com");

    await expect(inviteStudent(undefined, form)).resolves.toEqual({ error: "already invited" });
    expect(mocks.linkUpdateMany.mock.calls[0][0].where).toMatchObject({
      id: "link-1", status: "revoked", inviteToken: "old-token",
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("returns a normal conflict when concurrent requests create the same invite", async () => {
    mocks.linkCreate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "6.19.3" },
    ));
    const form = new FormData();
    form.set("studentEmail", "student@example.com");

    await expect(inviteStudent(undefined, form)).resolves.toEqual({ error: "already invited" });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("escapes counselor details before placing them in an HTML email", async () => {
    mocks.profile.fullName = '<img src=x onerror="alert(1)">';
    mocks.profile.school = "A&B";
    const form = new FormData();
    form.set("studentEmail", "student@example.com");

    await inviteStudent(undefined, form);

    const html = mocks.sendEmail.mock.calls[0][2] as string;
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("A&amp;B");
    expect(html).not.toContain("<img");
  });
});
