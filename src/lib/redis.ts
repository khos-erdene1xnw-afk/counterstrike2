import 'server-only';

/**
 * Caching layer. Uses Upstash Redis REST when configured (multi-instance safe),
 * otherwise falls back to a bounded in-memory LRU so the app still runs in dev
 * and single-instance deployments without Redis.
 */

interface CacheEntry { value: string; expiresAt: number; }

const MEM_MAX = 1000;
const mem = new Map<string, CacheEntry>();

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

async function upstash(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(UPSTASH_URL!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Upstash error ${res.status}`);
  const data = (await res.json()) as { result: unknown };
  return data.result;
}

function memEvictIfNeeded() {
  if (mem.size <= MEM_MAX) return;
  const firstKey = mem.keys().next().value;
  if (firstKey !== undefined) mem.delete(firstKey);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    if (useUpstash) {
      const raw = (await upstash(['GET', key])) as string | null;
      return raw ? (JSON.parse(raw) as T) : null;
    }
    const entry = mem.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      mem.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const raw = JSON.stringify(value);
    if (useUpstash) {
      await upstash(['SET', key, raw, 'EX', ttlSeconds]);
      return;
    }
    mem.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
    memEvictIfNeeded();
  } catch {
    /* cache failures must never break the request path */
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    if (useUpstash) {
      await upstash(['DEL', key]);
      return;
    }
    mem.delete(key);
  } catch { /* noop */ }
}

/** Distributed lock (SET NX EX). Returns true if the lock was acquired. */
export async function acquireLock(key: string, ttlSeconds = 30): Promise<boolean> {
  try {
    if (useUpstash) {
      const res = (await upstash(['SET', key, '1', 'NX', 'EX', ttlSeconds])) as string | null;
      return res === 'OK';
    }
    const entry = mem.get(key);
    if (entry && Date.now() < entry.expiresAt) return false;
    mem.set(key, { value: '1', expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  } catch {
    return false;
  }
}

export async function releaseLock(key: string): Promise<void> {
  await cacheDel(key);
}
