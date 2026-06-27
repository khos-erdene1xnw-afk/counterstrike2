// In-memory sliding-window rate limiter.
// For multi-instance production, back this with Upstash Redis using the same interface.

interface Bucket { count: number; resetAt: number; }
const store = new Map<string, Bucket>();

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  identifier: string,
  limit = 60,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  const bucket = store.get(identifier);

  if (!bucket || now > bucket.resetAt) {
    store.set(identifier, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { success: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { success: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

// Periodically evict expired buckets to bound memory.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of store.entries()) {
      if (now > bucket.resetAt) store.delete(key);
    }
  }, 5 * 60_000).unref?.();
}
