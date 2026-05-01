// WARNING: This is an in-memory rate limiter for local development only.
// Production deployments should use Redis or a distributed rate limiter.

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  if (record.count >= MAX_ATTEMPTS) {
    return true;
  }

  record.count += 1;
  return false;
}

export function getRateLimitStatus(key: string): {
  limited: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    return { limited: false, remaining: MAX_ATTEMPTS, resetAt: now + WINDOW_MS };
  }

  return {
    limited: record.count >= MAX_ATTEMPTS,
    remaining: Math.max(0, MAX_ATTEMPTS - record.count),
    resetAt: record.resetAt,
  };
}

export function resetRateLimit(key: string): void {
  rateLimitMap.delete(key);
}
