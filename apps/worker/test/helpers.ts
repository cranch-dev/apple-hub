import { getPublicKeyAsync, signAsync, utils } from "@noble/ed25519";
import { MemoryStore } from "../src/adapters/memory-store";
import { createApp } from "../src/app";
import type { Env } from "../src/env";
import { bytesToHex } from "../src/lib/crypto";

export const ADMIN_TOKEN = "test-admin-token";
export const START = Date.UTC(2026, 0, 1, 0, 0, 0);

export interface Harness {
  app: ReturnType<typeof createApp>;
  store: MemoryStore;
  env: Env;
  now(): number;
  advance(ms: number): void;
}

export function makeHarness(): Harness {
  const store = new MemoryStore();
  let current = START;
  const app = createApp({ getStore: () => store, now: () => current });

  return {
    app,
    store,
    env: { ADMIN_TOKEN, DISCORD_PUBLIC_KEY: "00".repeat(32) } as unknown as Env,
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

export function adminHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${ADMIN_TOKEN}`,
    "content-type": "application/json",
  };
}

export async function createKey(
  harness: Harness,
  body: Record<string, unknown> = {},
): Promise<{ id: string; key: string; prefix: string }> {
  const response = await harness.app.request(
    "/v1/admin/keys",
    {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ tier: "free", days: 1, edges: 1, ...body }),
    },
    harness.env,
  );
  if (response.status !== 201) {
    throw new Error(`createKey failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as { id: string; key: string; prefix: string };
}

export async function validate(
  harness: Harness,
  key: string,
  hwid: string,
  ip = "203.0.113.1",
  userId = "100",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await harness.app.request(
    "/v1/validate",
    {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify({ key, hwid, user_id: userId, place_id: "1" }),
    },
    harness.env,
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

export interface DiscordSigner {
  publicKeyHex: string;
  sign(body: string): Promise<{ signature: string; timestamp: string }>;
}

export async function makeDiscordSigner(): Promise<DiscordSigner> {
  const secret = utils.randomPrivateKey();
  const publicKeyHex = bytesToHex(await getPublicKeyAsync(secret));

  return {
    publicKeyHex,
    async sign(body: string) {
      const timestamp = "1767225600";
      const signature = bytesToHex(
        await signAsync(new TextEncoder().encode(timestamp + body), secret),
      );
      return { signature, timestamp };
    },
  };
}
