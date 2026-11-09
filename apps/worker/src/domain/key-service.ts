import { sha256Hex } from "../lib/crypto";
import { canonicalKey, generateKey, keyPrefix } from "../lib/keys";
import type { KeyRecord, Store, Tier } from "./store";

export const DAY_MS = 86_400_000;
export const FREE_KEY_DAYS = 1;
export const DISCORD_CLAIM_COOLDOWN_MS = DAY_MS;

export interface CreateKeyInput {
  tier: Tier;
  /** null means the key never expires. */
  days: number | null;
  edges: number;
  discordId?: string | null;
  note?: string | null;
  createdBy: string;
}

export interface CreatedKey {
  record: KeyRecord;
  /** The only time the plaintext key exists outside the user's hands. */
  plaintext: string;
}

export async function createKey(store: Store, input: CreateKeyInput, now: number): Promise<CreatedKey> {
  const plaintext = generateKey();
  const canonical = canonicalKey(plaintext);
  if (!canonical) {
    throw new Error("generated key failed canonicalization");
  }

  const record: KeyRecord = {
    id: crypto.randomUUID(),
    keyHash: await sha256Hex(canonical),
    keyPrefix: keyPrefix(canonical),
    tier: input.tier,
    maxEdges: Math.max(1, Math.trunc(input.edges)),
    discordId: input.discordId ?? null,
    note: input.note ?? null,
    createdBy: input.createdBy,
    createdAt: now,
    expiresAt: input.days === null ? null : now + input.days * DAY_MS,
    revokedAt: null,
    revokedReason: null,
  };

  await store.insertKey(record);
  await store.appendAudit({
    at: now,
    actor: input.createdBy,
    action: "key.create",
    target: record.id,
    detail: `${record.tier}/${record.keyPrefix}`,
  });

  return { record, plaintext: canonical };
}

export type ValidateFailure = "malformed" | "unknown" | "revoked" | "expired" | "edge_limit";

export interface ValidateInput {
  key: string;
  hwid: string;
  userId?: string | null;
}

export interface ValidateSuccess {
  ok: true;
  tier: Tier;
  keyPrefix: string;
  expiresAt: number | null;
  edge: { used: number; max: number };
}

export interface ValidateRejection {
  ok: false;
  reason: ValidateFailure;
  message: string;
}

export type ValidateResult = ValidateSuccess | ValidateRejection;

export async function validateKey(store: Store, input: ValidateInput, now: number): Promise<ValidateResult> {
  const canonical = canonicalKey(input.key);
  if (!canonical) {
    return { ok: false, reason: "malformed", message: "Format key tidak valid." };
  }

  const key = await store.findKeyByHash(await sha256Hex(canonical));
  if (!key) {
    return { ok: false, reason: "unknown", message: "Key tidak ditemukan." };
  }
  if (key.revokedAt !== null) {
    return { ok: false, reason: "revoked", message: "Key sudah dicabut." };
  }
  if (key.expiresAt !== null && key.expiresAt <= now) {
    return { ok: false, reason: "expired", message: "Key sudah kedaluwarsa." };
  }

  const hwidHash = await sha256Hex(input.hwid.trim());
  const userId = input.userId ?? null;
  const existing = await store.findRedemption(key.id, hwidHash);

  if (existing) {
    await store.touchRedemption(existing.id, now, userId);
  } else {
    const bound = await store.bindRedemption(
      {
        id: crypto.randomUUID(),
        keyId: key.id,
        hwidHash,
        userId,
        firstSeenAt: now,
        lastSeenAt: now,
        validationCount: 1,
      },
      key.maxEdges,
    );
    if (!bound) {
      const used = await store.listRedemptions(key.id);
      return {
        ok: false,
        reason: "edge_limit",
        message: `Key sudah dipakai di ${used.length}/${key.maxEdges} perangkat. Minta reset perangkat ke admin.`,
      };
    }
  }

  const redemptions = await store.listRedemptions(key.id);
  return {
    ok: true,
    tier: key.tier,
    keyPrefix: key.keyPrefix,
    expiresAt: key.expiresAt,
    edge: { used: redemptions.length, max: key.maxEdges },
  };
}

export async function revokeKey(
  store: Store,
  id: string,
  reason: string | null,
  actor: string,
  now: number,
): Promise<boolean> {
  const revoked = await store.setRevoked(id, now, reason);
  if (revoked) {
    await store.appendAudit({ at: now, actor, action: "key.revoke", target: id, detail: reason });
  }
  return revoked;
}

export async function resetEdges(store: Store, id: string, actor: string, now: number): Promise<number | null> {
  const key = await store.getKeyById(id);
  if (!key) {
    return null;
  }
  const removed = await store.deleteRedemptions(id);
  await store.appendAudit({ at: now, actor, action: "key.reset_edges", target: id, detail: `removed=${removed}` });
  return removed;
}

export type ClaimResult =
  | { ok: true; key: CreatedKey; nextClaimAt: number }
  | { ok: false; nextClaimAt: number };

export async function claimFreeKey(store: Store, discordId: string, now: number): Promise<ClaimResult> {
  const last = await store.getDiscordClaim(discordId);
  if (last !== null && now - last < DISCORD_CLAIM_COOLDOWN_MS) {
    return { ok: false, nextClaimAt: last + DISCORD_CLAIM_COOLDOWN_MS };
  }

  const key = await createKey(
    store,
    {
      tier: "free",
      days: FREE_KEY_DAYS,
      edges: 1,
      discordId,
      createdBy: `discord:${discordId}`,
    },
    now,
  );
  await store.setDiscordClaim(discordId, now);

  return { ok: true, key, nextClaimAt: now + DISCORD_CLAIM_COOLDOWN_MS };
}
