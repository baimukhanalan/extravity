import "server-only";
import { timingSafeEqual } from "crypto";

/**
 * Constant-time string comparison for shared secrets (bearer tokens, webhook
 * secret tokens). A plain `===`/`!==` short-circuits on the first differing
 * byte, which leaks length and content through timing. The secrets here are
 * high-entropy so the practical risk is low, but this is the correct primitive
 * and costs nothing.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
