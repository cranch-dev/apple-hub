import type { Context } from "hono";
import type { AppEnv } from "../app-env";
import { sha256Hex } from "../lib/crypto";
import { validateKey } from "../domain/key-service";
import {
  consumeLimit,
  failureLock,
  HWID_HOURLY,
  IP_BURST,
  IP_HOURLY,
  recordFailure,
} from "../domain/rate-limit";
import { asString, readJson } from "../http";

function tooMany(c: Context<AppEnv>, retryAfterSeconds: number) {
  return c.json(
    {
      ok: false,
      reason: "rate_limited",
      message: "Terlalu banyak percobaan. Coba lagi sebentar lagi.",
      retry_after: retryAfterSeconds,
    },
    429,
    { "Retry-After": String(retryAfterSeconds) },
  );
}

function clientIp(c: Context<AppEnv>): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-real-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function handleValidate(c: Context<AppEnv>): Promise<Response> {
  const now = c.get("now")();
  const store = c.get("store");
  const ip = clientIp(c);

  const lock = await failureLock(store, ip, now);
  if (!lock.allowed) {
    return tooMany(c, lock.retryAfterSeconds);
  }

  for (const policy of [IP_BURST, IP_HOURLY]) {
    const decision = await consumeLimit(store, `ip:${ip}`, now, policy);
    if (!decision.allowed) {
      return tooMany(c, decision.retryAfterSeconds);
    }
  }

  const body = await readJson(c);
  const key = asString(body?.key, 64);
  const hwid = asString(body?.hwid, 512);
  if (!body || !key || !hwid) {
    return c.json(
      { ok: false, reason: "bad_request", message: "key dan hwid wajib diisi." },
      400,
    );
  }

  const hwidDecision = await consumeLimit(store, `hwid:${await sha256Hex(hwid)}`, now, HWID_HOURLY);
  if (!hwidDecision.allowed) {
    return tooMany(c, hwidDecision.retryAfterSeconds);
  }

  const result = await validateKey(
    store,
    {
      key,
      hwid,
      userId: asString(body.user_id, 64),
    },
    now,
  );

  if (!result.ok) {
    await recordFailure(store, ip, now);
  }

  return c.json(result);
}
