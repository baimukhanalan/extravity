import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";

const COOKIE_NAME = "eckz_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type SessionPayload = {
  userId: string;
  role: Role;
  email: string;
};

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      userId: payload.userId as string,
      role: payload.role as Role,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

/** Full user + student profile, or null. */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { studentProfile: true, organizer: true, subscription: { include: { plan: true } } },
  });
  return user?.isActive && !user.deletedAt ? user : null;
}

/** Redirect to /login unless authenticated. Returns the user. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user || !user.isActive) redirect("/login");
  return user;
}

const STAFF: Role[] = ["MODERATOR", "ADMIN", "SUPER_ADMIN"];

export async function requireRole(roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/app");
  return user;
}

export async function requireAdmin() {
  return requireRole(STAFF);
}

export function isStaff(role: Role): boolean {
  return STAFF.includes(role);
}

/**
 * Organizer portal gate. An account becomes an organizer by filling the
 * registration form, which creates the Organizer record — so the record,
 * not the role alone, is what grants access.
 */
export async function requireOrganizer() {
  const user = await requireUser();
  if (!user.organizer) redirect("/organizer/register");
  return { user, organizer: user.organizer };
}

/** Parent portal gate — access comes from at least one link addressed to this account. */
export async function requireParent() {
  const user = await requireUser();
  const links = await prisma.parentStudentLink.findMany({
    where: { parentUserId: user.id, status: { in: ["pending", "active"] } },
    include: {
      consents: true,
      student: { select: { id: true, email: true, studentProfile: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (links.length === 0) redirect("/parent/no-access");
  return { user, links };
}

/** Counsellor portal gate — same "profile is the grant" rule. */
export async function requireCounselor() {
  const user = await requireUser();
  const profile = await prisma.counselorProfile.findUnique({ where: { userId: user.id } });
  if (!profile) redirect("/counselor/register");
  return { user, profile };
}
