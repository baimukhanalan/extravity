import { prisma } from "./prisma";

/** Read a feature flag (defaults to false when missing). */
export async function isFlagEnabled(key: string): Promise<boolean> {
  const f = await prisma.featureFlag.findUnique({ where: { key } });
  return f?.enabled ?? false;
}
