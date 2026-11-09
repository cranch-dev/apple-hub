import type { Store } from "./store";

export interface LimitPolicy {
  windowSeconds: number;
  limit: number;
}

export interface LimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export const IP_BURST: LimitPolicy = { windowSeconds: 60, limit: 10 };
export const IP_HOURLY: LimitPolicy = { windowSeconds: 3600, limit: 100 };
export const HWID_HOURLY: LimitPolicy = { windowSeconds: 3600, limit: 30 };
export const FAILURE_WINDOW: LimitPolicy = { windowSeconds: 900, limit: 20 };

function retryAfter(windowStart: number, policy: LimitPolicy, now: number): number {
  const remaining = windowStart + policy.windowSeconds * 1000 - now;
  return Math.max(1, Math.ceil(remaining / 1000));
}

export async function consumeLimit(
  store: Store,
  bucket: string,
  now: number,
  policy: LimitPolicy,
): Promise<LimitDecision> {
  const snapshot = await store.consumeRate(bucket, now, policy.windowSeconds);
  const allowed = snapshot.count <= policy.limit;
  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : retryAfter(snapshot.windowStart, policy, now),
  };
}

/** Blocks an IP only after too many failed attempts inside the failure window. */
export async function failureLock(store: Store, ip: string, now: number): Promise<LimitDecision> {
  const failures = await store.peekRate(`fail:${ip}`, now, FAILURE_WINDOW.windowSeconds);
  const locked = failures >= FAILURE_WINDOW.limit;
  return {
    allowed: !locked,
    retryAfterSeconds: locked ? FAILURE_WINDOW.windowSeconds : 0,
  };
}

export async function recordFailure(store: Store, ip: string, now: number): Promise<void> {
  await store.consumeRate(`fail:${ip}`, now, FAILURE_WINDOW.windowSeconds);
}
