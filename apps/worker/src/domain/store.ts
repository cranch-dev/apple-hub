export type Tier = "free" | "premium";

export interface KeyRecord {
  id: string;
  keyHash: string;
  keyPrefix: string;
  tier: Tier;
  maxEdges: number;
  discordId: string | null;
  note: string | null;
  createdBy: string;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
  revokedReason: string | null;
}

export interface RedemptionRecord {
  id: string;
  keyId: string;
  hwidHash: string;
  userId: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
  validationCount: number;
}

export interface AuditEntry {
  at: number;
  actor: string;
  action: string;
  target: string | null;
  detail: string | null;
}

export interface RateSnapshot {
  count: number;
  windowStart: number;
}

/**
 * Everything the key service needs from persistence. Two adapters implement
 * this: D1 in production and an in-memory version in tests.
 */
export interface Store {
  findKeyByHash(hash: string): Promise<KeyRecord | null>;
  getKeyById(id: string): Promise<KeyRecord | null>;
  insertKey(key: KeyRecord): Promise<void>;
  listKeys(query: string | null, limit: number): Promise<KeyRecord[]>;
  setRevoked(id: string, at: number, reason: string | null): Promise<boolean>;

  listRedemptions(keyId: string): Promise<RedemptionRecord[]>;
  findRedemption(keyId: string, hwidHash: string): Promise<RedemptionRecord | null>;
  /** Atomically binds a new device, returning false when maxEdges is reached. */
  bindRedemption(redemption: RedemptionRecord, maxEdges: number): Promise<boolean>;
  touchRedemption(id: string, at: number, userId: string | null): Promise<void>;
  deleteRedemptions(keyId: string): Promise<number>;

  getDiscordClaim(discordId: string): Promise<number | null>;
  setDiscordClaim(discordId: string, at: number): Promise<void>;

  consumeRate(bucket: string, at: number, windowSeconds: number): Promise<RateSnapshot>;
  peekRate(bucket: string, at: number, windowSeconds: number): Promise<number>;

  appendAudit(entry: AuditEntry): Promise<void>;
}
