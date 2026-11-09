import { describe, expect, test } from "bun:test";
import {
  adminHeaders,
  createKey,
  makeHarness,
  START,
  validate,
} from "./helpers";

const DAY = 86_400_000;

describe("key validation", () => {
  test("binds the first device and accepts repeat visits from it", async () => {
    const harness = makeHarness();
    const created = await createKey(harness);

    const first = await validate(harness, created.key, "device-a", "203.0.113.10");
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(first.body.tier).toBe("free");
    expect(first.body.edge).toEqual({ used: 1, max: 1 });

    const second = await validate(harness, created.key, "device-a", "203.0.113.10");
    expect(second.body.ok).toBe(true);
  });

  test("accepts keys typed with spaces or lowercase", async () => {
    const harness = makeHarness();
    const created = await createKey(harness);
    const messy = `apl ${created.key.slice(4).toLowerCase().replaceAll("-", " ")}`;

    const result = await validate(harness, messy, "device-a", "203.0.113.11");
    expect(result.body.ok).toBe(true);
  });

  test("rejects a second device until edges are reset", async () => {
    const harness = makeHarness();
    const created = await createKey(harness);

    await validate(harness, created.key, "device-a", "203.0.113.12");
    const blocked = await validate(harness, created.key, "device-b", "203.0.113.12");
    expect(blocked.body.ok).toBe(false);
    expect(blocked.body.reason).toBe("edge_limit");

    const reset = await harness.app.request(
      `/v1/admin/keys/${created.id}/reset-edge`,
      { method: "POST", headers: adminHeaders() },
      harness.env,
    );
    expect(reset.status).toBe(200);
    expect((await reset.json()).removed).toBe(1);

    const allowed = await validate(harness, created.key, "device-b", "203.0.113.12");
    expect(allowed.body.ok).toBe(true);
  });

  test("two edges for premium keys", async () => {
    const harness = makeHarness();
    const created = await createKey(harness, { tier: "premium", days: 30, edges: 2 });

    expect((await validate(harness, created.key, "device-a", "203.0.113.13")).body.ok).toBe(true);
    expect((await validate(harness, created.key, "device-b", "203.0.113.13")).body.ok).toBe(true);
    const third = await validate(harness, created.key, "device-c", "203.0.113.13");
    expect(third.body.reason).toBe("edge_limit");
  });

  test("rejects revoked keys", async () => {
    const harness = makeHarness();
    const created = await createKey(harness);

    const revoke = await harness.app.request(
      `/v1/admin/keys/${created.id}/revoke`,
      {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ reason: "chargeback" }),
      },
      harness.env,
    );
    expect(revoke.status).toBe(200);

    const result = await validate(harness, created.key, "device-a", "203.0.113.14");
    expect(result.body.ok).toBe(false);
    expect(result.body.reason).toBe("revoked");
  });

  test("expires after the configured days", async () => {
    const harness = makeHarness();
    const created = await createKey(harness, { days: 1 });

    harness.advance(DAY + 1);
    const result = await validate(harness, created.key, "device-a", "203.0.113.15");
    expect(result.body.reason).toBe("expired");
  });

  test("lifetime keys never expire", async () => {
    const harness = makeHarness();
    const created = await createKey(harness, { tier: "premium", lifetime: true });

    harness.advance(DAY * 3650);
    const result = await validate(harness, created.key, "device-a", "203.0.113.16");
    expect(result.body.ok).toBe(true);
    expect(result.body.expiresAt ?? null).toBeNull();
  });

  test("rejects malformed and unknown keys", async () => {
    const harness = makeHarness();
    const malformed = await validate(harness, "not-a-key", "device-a", "203.0.113.17");
    expect(malformed.body.reason).toBe("malformed");

    const unknown = await validate(harness, "APL-2222-3333-4444", "device-a", "203.0.113.17");
    expect(unknown.body.reason).toBe("unknown");
  });

  test("records the Roblox user that used the key", async () => {
    const harness = makeHarness();
    const created = await createKey(harness);
    await validate(harness, created.key, "device-a", "203.0.113.18", "555");

    const show = await harness.app.request(
      `/v1/admin/keys/${created.id}`,
      { headers: adminHeaders() },
      harness.env,
    );
    const payload = await show.json();
    expect(payload.distinct_users).toBe(1);
    expect(payload.redemptions[0].user_id).toBe("555");
  });
});

describe("rate limiting", () => {
  test("limits one IP to 10 validations per minute", async () => {
    const harness = makeHarness();
    const created = await createKey(harness);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = await validate(harness, created.key, "device-a", "198.51.100.7");
      expect(result.status).toBe(200);
    }

    const blocked = await validate(harness, created.key, "device-a", "198.51.100.7");
    expect(blocked.status).toBe(429);
    expect(blocked.body.reason).toBe("rate_limited");
  });

  test("resets the window after a minute", async () => {
    const harness = makeHarness();
    const created = await createKey(harness);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await validate(harness, created.key, "device-a", "198.51.100.8");
    }
    harness.advance(61_000);

    const allowed = await validate(harness, created.key, "device-a", "198.51.100.8");
    expect(allowed.status).toBe(200);
  });
});

describe("admin api", () => {
  test("requires the bearer token", async () => {
    const harness = makeHarness();
    const unauthorized = await harness.app.request(
      "/v1/admin/keys",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      harness.env,
    );
    expect(unauthorized.status).toBe(401);
  });

  test("is disabled when ADMIN_TOKEN is unset", async () => {
    const harness = makeHarness();
    const response = await harness.app.request(
      "/v1/admin/keys",
      { headers: adminHeaders() },
      { ...harness.env, ADMIN_TOKEN: undefined } as typeof harness.env,
    );
    expect(response.status).toBe(503);
  });

  test("lists keys by prefix", async () => {
    const harness = makeHarness();
    const created = await createKey(harness);

    const response = await harness.app.request(
      `/v1/admin/keys?query=${created.prefix}`,
      { headers: adminHeaders() },
      harness.env,
    );
    const payload = await response.json();
    expect(payload.keys).toHaveLength(1);
    expect(payload.keys[0].id).toBe(created.id);
    expect(payload.keys[0].key_hash).toBeUndefined();
  });
});

describe("static assets", () => {
  test("manifest carries an ETag and supports 304", async () => {
    const harness = makeHarness();
    const first = await harness.app.request("/v1/manifest", {}, harness.env);
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    const manifest = await first.json();
    expect(manifest.schema).toBe(1);
    expect(manifest.games[0].universe_id).toBe(10767824942);

    const cached = await harness.app.request(
      "/v1/manifest",
      { headers: { "if-none-match": etag ?? "" } },
      harness.env,
    );
    expect(cached.status).toBe(304);
  });

  test("loader is served with the request origin injected", async () => {
    const harness = makeHarness();
    const response = await harness.app.request("https://hub.example/loader", {}, harness.env);
    const body = await response.text();
    expect(body).toContain('local BASE = "https://hub.example"');
    expect(body).not.toContain("__APPLEHUB_BASE__");
  });

  test("modules are served by manifest path", async () => {
    const harness = makeHarness();
    const manifestResponse = await harness.app.request("/v1/manifest", {}, harness.env);
    const manifest = await manifestResponse.json();
    const path = manifest.games[0].path;

    const module = await harness.app.request(path, {}, harness.env);
    expect(module.status).toBe(200);
    expect(await module.text()).toContain("Assasin Leveling");

    const missing = await harness.app.request("/v1/modules/nope.luau", {}, harness.env);
    expect(missing.status).toBe(404);
  });

  test("hub core is served", async () => {
    const harness = makeHarness();
    const response = await harness.app.request("/v1/hub", {}, harness.env);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("function Hub.start");
  });

  test("clock starts where the harness says", () => {
    const harness = makeHarness();
    expect(harness.now()).toBe(START);
  });
});
