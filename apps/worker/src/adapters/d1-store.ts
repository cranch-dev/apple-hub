import type {
  AuditEntry,
  KeyRecord,
  RateSnapshot,
  RedemptionRecord,
  Store,
  Tier,
} from "../domain/store";

interface KeyRow {
  id: string;
  key_hash: string;
  key_prefix: string;
  tier: string;
  max_edges: number;
  discord_id: string | null;
  note: string | null;
  created_by: string;
  created_at: number;
  expires_at: number | null;
  revoked_at: number | null;
  revoked_reason: string | null;
}

interface RedemptionRow {
  id: string;
  key_id: string;
  hwid_hash: string;
  user_id: string | null;
  first_seen_at: number;
  last_seen_at: number;
  validation_count: number;
}

interface RateRow {
  count: number;
  window_start: number;
}

function mapKey(row: KeyRow): KeyRecord {
  return {
    id: row.id,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    tier: (row.tier === "premium" ? "premium" : "free") as Tier,
    maxEdges: row.max_edges,
    discordId: row.discord_id,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
  };
}

function mapRedemption(row: RedemptionRow): RedemptionRecord {
  return {
    id: row.id,
    keyId: row.key_id,
    hwidHash: row.hwid_hash,
    userId: row.user_id,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    validationCount: row.validation_count,
  };
}

/** D1-backed Store. All writes are single statements so they stay atomic. */
export class D1Store implements Store {
  constructor(private readonly db: D1Database) {}

  async findKeyByHash(hash: string): Promise<KeyRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM keys WHERE key_hash = ?")
      .bind(hash)
      .first<KeyRow>();
    return row ? mapKey(row) : null;
  }

  async getKeyById(id: string): Promise<KeyRecord | null> {
    const row = await this.db.prepare("SELECT * FROM keys WHERE id = ?").bind(id).first<KeyRow>();
    return row ? mapKey(row) : null;
  }

  async insertKey(key: KeyRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO keys
          (id, key_hash, key_prefix, tier, max_edges, discord_id, note, created_by, created_at, expires_at, revoked_at, revoked_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        key.id,
        key.keyHash,
        key.keyPrefix,
        key.tier,
        key.maxEdges,
        key.discordId,
        key.note,
        key.createdBy,
        key.createdAt,
        key.expiresAt,
        key.revokedAt,
        key.revokedReason,
      )
      .run();
  }

  async listKeys(query: string | null, limit: number): Promise<KeyRecord[]> {
    const needle = query?.trim() ?? "";
    const result = needle
      ? await this.db
          .prepare(
            `SELECT * FROM keys
             WHERE key_prefix LIKE ? OR discord_id = ? OR id = ?
             ORDER BY created_at DESC LIMIT ?`,
          )
          .bind(`%${needle.toUpperCase()}%`, needle, needle, limit)
          .all<KeyRow>()
      : await this.db
          .prepare("SELECT * FROM keys ORDER BY created_at DESC LIMIT ?")
          .bind(limit)
          .all<KeyRow>();
    return result.results.map(mapKey);
  }

  async setRevoked(id: string, at: number, reason: string | null): Promise<boolean> {
    const result = await this.db
      .prepare("UPDATE keys SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL")
      .bind(at, reason, id)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async listRedemptions(keyId: string): Promise<RedemptionRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM redemptions WHERE key_id = ? ORDER BY first_seen_at ASC")
      .bind(keyId)
      .all<RedemptionRow>();
    return result.results.map(mapRedemption);
  }

  async findRedemption(keyId: string, hwidHash: string): Promise<RedemptionRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM redemptions WHERE key_id = ? AND hwid_hash = ?")
      .bind(keyId, hwidHash)
      .first<RedemptionRow>();
    return row ? mapRedemption(row) : null;
  }

  async bindRedemption(redemption: RedemptionRecord, maxEdges: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO redemptions
          (id, key_id, hwid_hash, user_id, first_seen_at, last_seen_at, validation_count)
         SELECT ?, ?, ?, ?, ?, ?, 1
         WHERE (SELECT COUNT(*) FROM redemptions WHERE key_id = ?) < ?`,
      )
      .bind(
        redemption.id,
        redemption.keyId,
        redemption.hwidHash,
        redemption.userId,
        redemption.firstSeenAt,
        redemption.lastSeenAt,
        redemption.keyId,
        maxEdges,
      )
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async touchRedemption(id: string, at: number, userId: string | null): Promise<void> {
    await this.db
      .prepare(
        `UPDATE redemptions
         SET last_seen_at = ?, validation_count = validation_count + 1, user_id = COALESCE(?, user_id)
         WHERE id = ?`,
      )
      .bind(at, userId, id)
      .run();
  }

  async deleteRedemptions(keyId: string): Promise<number> {
    const result = await this.db
      .prepare("DELETE FROM redemptions WHERE key_id = ?")
      .bind(keyId)
      .run();
    return result.meta.changes ?? 0;
  }

  async getDiscordClaim(discordId: string): Promise<number | null> {
    const row = await this.db
      .prepare("SELECT last_claim_at FROM discord_claims WHERE discord_id = ?")
      .bind(discordId)
      .first<{ last_claim_at: number }>();
    return row ? row.last_claim_at : null;
  }

  async setDiscordClaim(discordId: string, at: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO discord_claims (discord_id, last_claim_at) VALUES (?, ?)
         ON CONFLICT(discord_id) DO UPDATE SET last_claim_at = excluded.last_claim_at`,
      )
      .bind(discordId, at)
      .run();
  }

  async consumeRate(bucket: string, at: number, windowSeconds: number): Promise<RateSnapshot> {
    const windowMs = windowSeconds * 1000;
    const row = await this.db
      .prepare(
        `INSERT INTO rate_limits (bucket, window_start, count)
         VALUES (?, ?, 1)
         ON CONFLICT(bucket) DO UPDATE SET
           count = CASE WHEN rate_limits.window_start + ? <= ? THEN 1 ELSE rate_limits.count + 1 END,
           window_start = CASE WHEN rate_limits.window_start + ? <= ? THEN ? ELSE rate_limits.window_start END
         RETURNING count, window_start`,
      )
      .bind(bucket, at, windowMs, at, windowMs, at, at)
      .first<RateRow>();

    if (!row) {
      return { count: 1, windowStart: at };
    }
    return { count: row.count, windowStart: row.window_start };
  }

  async peekRate(bucket: string, at: number, windowSeconds: number): Promise<number> {
    const row = await this.db
      .prepare("SELECT count, window_start FROM rate_limits WHERE bucket = ?")
      .bind(bucket)
      .first<RateRow>();
    if (!row || row.window_start + windowSeconds * 1000 <= at) {
      return 0;
    }
    return row.count;
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    await this.db
      .prepare("INSERT INTO audit_log (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(entry.at, entry.actor, entry.action, entry.target, entry.detail)
      .run();
  }
}
