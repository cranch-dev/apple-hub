import { Hono } from "hono";
import type { AppEnv } from "../app-env";
import { createKey, resetEdges, revokeKey } from "../domain/key-service";
import type { KeyRecord, RedemptionRecord } from "../domain/store";
import { asInt, asString, readJson } from "../http";
import { safeEqual } from "../lib/crypto";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", async (c, next) => {
  const expected = c.env.ADMIN_TOKEN;
  if (!expected) {
    return c.json({ error: "admin_disabled", message: "ADMIN_TOKEN belum diset." }, 503);
  }
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !(await safeEqual(token, expected))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

function serializeKey(key: KeyRecord) {
  return {
    id: key.id,
    prefix: key.keyPrefix,
    tier: key.tier,
    edges: key.maxEdges,
    discord_id: key.discordId,
    note: key.note,
    created_by: key.createdBy,
    created_at: key.createdAt,
    expires_at: key.expiresAt,
    revoked_at: key.revokedAt,
    revoked_reason: key.revokedReason,
  };
}

function serializeRedemption(redemption: RedemptionRecord) {
  return {
    id: redemption.id,
    hwid_hash: redemption.hwidHash,
    user_id: redemption.userId,
    first_seen_at: redemption.firstSeenAt,
    last_seen_at: redemption.lastSeenAt,
    validation_count: redemption.validationCount,
  };
}

adminRoutes.post("/keys", async (c) => {
  const body = await readJson(c);
  if (!body) {
    return c.json({ error: "bad_request" }, 400);
  }

  const tier = body.tier === "premium" ? "premium" : "free";
  const edgesInput = asInt(body.edges);
  const edges = edgesInput ?? (tier === "premium" ? 2 : 1);
  if (edges < 1 || edges > 10) {
    return c.json({ error: "bad_request", message: "edges harus 1-10." }, 400);
  }

  const rawDays = body.days;
  let days: number | null;
  if (body.lifetime === true) {
    days = null;
  } else if (rawDays === null || rawDays === undefined) {
    days = tier === "free" ? 1 : null;
  } else {
    const parsed = asInt(rawDays);
    if (parsed === null || parsed < 1 || parsed > 3650) {
      return c.json({ error: "bad_request", message: "days harus 1-3650 atau null." }, 400);
    }
    days = parsed;
  }

  const created = await createKey(
    c.get("store"),
    {
      tier,
      days,
      edges,
      discordId: asString(body.discord_id, 32),
      note: asString(body.note, 200),
      createdBy: "admin",
    },
    c.get("now")(),
  );

  return c.json(
    {
      id: created.record.id,
      key: created.plaintext,
      prefix: created.record.keyPrefix,
      tier: created.record.tier,
      edges: created.record.maxEdges,
      expires_at: created.record.expiresAt,
    },
    201,
  );
});

adminRoutes.get("/keys", async (c) => {
  const query = asString(c.req.query("query"), 64);
  const limit = Math.min(Math.max(asInt(Number(c.req.query("limit"))) ?? 50, 1), 200);
  const keys = await c.get("store").listKeys(query, limit);
  return c.json({ keys: keys.map(serializeKey) });
});

adminRoutes.get("/keys/:id", async (c) => {
  const store = c.get("store");
  const key = await store.getKeyById(c.req.param("id"));
  if (!key) {
    return c.json({ error: "not_found" }, 404);
  }
  const redemptions = await store.listRedemptions(key.id);
  const distinctUsers = new Set(
    redemptions.map((redemption) => redemption.userId).filter((id): id is string => id !== null),
  ).size;

  return c.json({
    key: serializeKey(key),
    redemptions: redemptions.map(serializeRedemption),
    distinct_users: distinctUsers,
  });
});

adminRoutes.post("/keys/:id/revoke", async (c) => {
  const body = await readJson(c);
  const reason = asString(body?.reason, 200);
  const revoked = await revokeKey(c.get("store"), c.req.param("id"), reason, "admin", c.get("now")());
  if (!revoked) {
    return c.json({ error: "not_found_or_already_revoked" }, 404);
  }
  return c.json({ ok: true });
});

adminRoutes.post("/keys/:id/reset-edge", async (c) => {
  const removed = await resetEdges(c.get("store"), c.req.param("id"), "admin", c.get("now")());
  if (removed === null) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({ ok: true, removed });
});
