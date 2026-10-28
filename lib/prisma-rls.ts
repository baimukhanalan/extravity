import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * RLS-aware Prisma client factory (optional second layer — see prisma/rls/).
 *
 * Row-Level Security keys on the session variable `app.user_id`. With a pooled
 * connection the variable must be set *inside the same transaction* as the
 * query (`SET LOCAL`), because transaction pooling hands each statement a
 * different backend. This helper runs the caller's work in one transaction that
 * first sets the variable.
 *
 * Use it only after activating RLS per prisma/rls/README.md. Until then the app
 * uses the plain client in lib/prisma.ts, and server-side authorization is the
 * enforced layer.
 *
 *   const app = await withUser(userId, (tx) => tx.application.findMany());
 */
export function createRlsClient(): PrismaClient {
  return new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"] });
}

const client = createRlsClient();

export async function withUser<T>(
  userId: string,
  work: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (tx) => {
    // SET LOCAL is scoped to this transaction, so it is safe under pgbouncer
    // transaction pooling. Parameterised via set_config to avoid interpolation.
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return work(tx);
  });
}
