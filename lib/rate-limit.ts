import "server-only";

/**
 * Sliding-window rate limiter with two backends.
 *
 * On Vercel each request can hit a different serverless instance, so an
 * in-memory counter does not actually limit anything in production. When
 * `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, the limiter
 * uses a shared Redis sorted set and the window is enforced across all
 * instances. Without them it falls back to the in-memory store — fine for local
 * development and as a last resort, and the call sites never change.
 */

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterMs: number };

/* ---------------- In-memory (per-instance) ---------------- */

const buckets = new Map<string, number[]>();

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, remaining: 0, retryAfterMs: hits[0] + windowMs - now };
  }

  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => t <= cutoff)) buckets.delete(k);
  }
  return { ok: true, remaining: limit - hits.length, retryAfterMs: 0 };
}

/* ---------------- Upstash Redis (shared) ---------------- */

function upstashConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/** One pipelined round-trip: prune the window, add this hit, count, expire. */
async function redisLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  const cutoff = now - windowMs;
  const member = `${now}-${Math.random().toString(36).slice(2)}`;
  const redisKey = `rl:${key}`;

  const commands = [
    ["ZREMRANGEBYSCORE", redisKey, "0", String(cutoff)],
    ["ZADD", redisKey, String(now), member],
    ["ZCARD", redisKey],
    ["ZRANGE", redisKey, "0", "0", "WITHSCORES"],
    ["PEXPIRE", redisKey, String(windowMs)],
  ];

  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    // A limiter must never hang a request; on timeout we fail open below.
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);

  const results = (await res.json()) as { result: unknown }[];
  const count = Number(results[2]?.result ?? 0);
  const oldest = (results[3]?.result as string[] | undefined) ?? [];
  const oldestScore = oldest.length >= 2 ? Number(oldest[1]) : now;

  if (count > limit) {
    return { ok: false, remaining: 0, retryAfterMs: Math.max(0, oldestScore + windowMs - now) };
  }
  return { ok: true, remaining: Math.max(0, limit - count), retryAfterMs: 0 };
}

/* ---------------- Public API ---------------- */

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  if (!upstashConfigured()) return memoryLimit(key, limit, windowMs);
  try {
    return await redisLimit(key, limit, windowMs);
  } catch {
    // Fail open rather than lock everyone out if Redis blips — combined with the
    // per-instance memory limiter as a floor, this is the safer failure mode.
    return memoryLimit(key, limit, windowMs);
  }
}
