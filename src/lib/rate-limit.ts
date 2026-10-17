/**
 * In-memory sliding-window rate limiter (spec §6: public API is rate
 * limited). A Map of timestamp lists with a periodic sweep — no external
 * dependency, per P3-T5. P7-T4 extends this with @upstash/ratelimit when
 * UPSTASH_REDIS_REST_URL is configured (multi-instance safe).
 */

type Window = { hits: number[] };

const store = new Map<string, Window>();
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number, windowMs: number) {
  for (const [key, window] of store) {
    window.hits = window.hits.filter((t) => now - t < windowMs);
    if (window.hits.length === 0) store.delete(key);
  }
}

/** Record a hit for `key`. Returns ok=false with retryAfterSeconds when the limit is exceeded. */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  if (now - lastSweep > SWEEP_INTERVAL_MS) {
    sweep(now, windowMs);
    lastSweep = now;
  }

  let window = store.get(key);
  if (!window) {
    window = { hits: [] };
    store.set(key, window);
  }
  window.hits = window.hits.filter((t) => now - t < windowMs);

  if (window.hits.length >= limit) {
    const oldest = window.hits[0] ?? now;
    const retryAfterMs = windowMs - (now - oldest);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  window.hits.push(now);
  return { ok: true, retryAfterSeconds: 0 };
}

/** Best-effort client IP for rate-limit keys (first X-Forwarded-For entry). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "local";
}

/** 429 error envelope with a Retry-After header (spec error shape). */
export function rateLimitResponse(retryAfterSeconds: number): Response {
  return Response.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again in a moment.",
      },
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  );
}

/** Convenience: check and build the 429 response in one call. */
export function enforceRateLimit(
  request: Request,
  scope: string,
  limit = 60,
  windowMs = 60_000
): Response | null {
  const result = checkRateLimit(`${scope}:${clientIp(request)}`, limit, windowMs);
  return result.ok ? null : rateLimitResponse(result.retryAfterSeconds);
}
