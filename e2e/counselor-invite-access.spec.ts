import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("only the invited student can accept a counselor link", async ({ page, browser }) => {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("A dedicated local E2E database is required");
  }

  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const email = `counselor-invite-${suffix}@example.kz`;
  const counselor = await prisma.counselorProfile.findFirstOrThrow({ where: { user: { email: "counselor@demo.kz" } } });
  const student = await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash("password123", 10), role: "STUDENT" },
  });

  try {
    await prisma.studentProfile.create({
      data: { userId: student.id, firstName: "Invited", lastName: "Student", onboardingCompleted: true },
    });
    const link = await prisma.counselorStudentLink.create({
      data: {
        counselorId: counselor.id,
        studentEmail: email,
        inviteToken: `e2e-${suffix}`,
        status: "pending",
      },
    });

    await login(page, "student@demo.kz");
    await page.goto(`/counselor/invite/${link.inviteToken}`);
    await expect(page.getByRole("button", { name: "Принять" })).toHaveCount(0);
    expect((await prisma.counselorStudentLink.findUniqueOrThrow({ where: { id: link.id } })).status).toBe("pending");

    const recipientContext = await browser.newContext();
    try {
      const recipientPage = await recipientContext.newPage();
      await login(recipientPage, email);
      await recipientPage.goto(`/counselor/invite/${link.inviteToken}`);
      await recipientPage.getByRole("button", { name: "Принять" }).click();
      await expect(recipientPage.getByText("Приглашение уже принято.")).toBeVisible();
      const accepted = await prisma.counselorStudentLink.findUniqueOrThrow({ where: { id: link.id } });
      expect(accepted.status).toBe("active");
      expect(accepted.studentUserId).toBe(student.id);
      expect(accepted.acceptedAt).not.toBeNull();
    } finally {
      await recipientContext.close();
    }
  } finally {
    await prisma.counselorStudentLink.deleteMany({ where: { studentEmail: email } });
    await prisma.user.delete({ where: { id: student.id } });
    await prisma.$disconnect();
  }
});
