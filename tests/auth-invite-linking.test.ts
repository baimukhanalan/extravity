import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn().mockResolvedValue(null),
  userCreate: vi.fn().mockResolvedValue({ id: "new-user", email: "invitee@example.com", role: "STUDENT" }),
  parentUpdateMany: vi.fn(),
  counselorUpdateMany: vi.fn(),
  auditCreate: vi.fn().mockResolvedValue({}),
  createSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique, create: mocks.userCreate },
    parentStudentLink: { updateMany: mocks.parentUpdateMany },
    counselorStudentLink: { updateMany: mocks.counselorUpdateMany },
    auditLog: { create: mocks.auditCreate },
  },
}));
vi.mock("@/lib/auth", () => ({
  hashPassword: vi.fn().mockResolvedValue("hash"),
  createSession: mocks.createSession,
  destroySession: vi.fn(),
  requireUser: vi.fn(),
  verifyPassword: vi.fn(),
}));
vi.mock("@/lib/locale", () => ({
  getT: vi.fn().mockResolvedValue({
    t: {
      actA: {
        invalidEmail: "invalid email",
        passwordTooShort: "short password",
        firstNameRequired: "first name required",
        lastNameRequired: "last name required",
        emailExists: "exists",
      },
    },
  }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirect"); }) }));

import { signupAction } from "@/app/actions/auth";

describe("signup invitation isolation", () => {
  it("does not attach pending invitations from a self-asserted email", async () => {
    const form = new FormData();
    form.set("email", "Invitee@Example.com");
    form.set("password", "password123");
    form.set("firstName", "Test");
    form.set("lastName", "User");

    await expect(signupAction(undefined, form)).rejects.toThrow("redirect");

    expect(mocks.userCreate).toHaveBeenCalledOnce();
    expect(mocks.parentUpdateMany).not.toHaveBeenCalled();
    expect(mocks.counselorUpdateMany).not.toHaveBeenCalled();
  });
});
