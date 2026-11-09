import type {
  AuditEntry,
  KeyRecord,
  RateSnapshot,
  RedemptionRecord,
  Store,
} from "../domain/store";

interface RateBucket {
  windowStart: number;
  count: number;
}

/** In-memory Store used by tests and by local scripts. Mirrors D1 semantics. */
export class MemoryStore implements Store {
  private readonly keys = new Map<string, KeyRecord>();
  private readonly redemptions = new Map<string, RedemptionRecord>();
  private readonly claims = new Map<string, number>();
  private readonly rates = new Map<string, RateBucket>();

  readonly audit: AuditEntry[] = [];

  async findKeyByHash(hash: string): Promise<KeyRecord | null> {
    for (const key of this.keys.values()) {
      if (key.keyHash === hash) {
        return { ...key };
      }
    }
    return null;
  }

  async getKeyById(id: string): Promise<KeyRecord | null> {
    const key = this.keys.get(id);
    return key ? { ...key } : null;
  }

  async insertKey(key: KeyRecord): Promise<void> {
    this.keys.set(key.id, { ...key });
  }

  async listKeys(query: string | null, limit: number): Promise<KeyRecord[]> {
    const needle = query?.trim().toUpperCase() ?? "";
    const rows = [...this.keys.values()]
      .filter((key) => {
        if (!needle) {
          return true;
        }
        return (
          key.keyPrefix.includes(needle) ||
          key.id.toUpperCase() === needle ||
          (key.discordId?.toUpperCase() ?? "").includes(needle)
        );
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
    return rows.map((key) => ({ ...key }));
  }

  async setRevoked(id: string, at: number, reason: string | null): Promise<boolean> {
    const key = this.keys.get(id);
    if (!key || key.revokedAt !== null) {
      return false;
    }
    key.revokedAt = at;
    key.revokedReason = reason;
    return true;
  }

  async listRedemptions(keyId: string): Promise<RedemptionRecord[]> {
    return [...this.redemptions.values()]
      .filter((redemption) => redemption.keyId === keyId)
      .map((redemption) => ({ ...redemption }));
  }

  async findRedemption(keyId: string, hwidHash: string): Promise<RedemptionRecord | null> {
    for (const redemption of this.redemptions.values()) {
      if (redemption.keyId === keyId && redemption.hwidHash === hwidHash) {
        return { ...redemption };
      }
    }
    return null;
  }

  async bindRedemption(redemption: RedemptionRecord, maxEdges: number): Promise<boolean> {
    const used = await this.listRedemptions(redemption.keyId);
    if (used.length >= maxEdges) {
      return false;
    }
    this.redemptions.set(redemption.id, { ...redemption });
    return true;
  }

  async touchRedemption(id: string, at: number, userId: string | null): Promise<void> {
    const redemption = this.redemptions.get(id);
    if (!redemption) {
      return;
    }
    redemption.lastSeenAt = at;
    redemption.validationCount += 1;
    if (userId !== null) {
      redemption.userId = userId;
    }
  }

  async deleteRedemptions(keyId: string): Promise<number> {
    let removed = 0;
    for (const [id, redemption] of this.redemptions) {
      if (redemption.keyId === keyId) {
        this.redemptions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  async getDiscordClaim(discordId: string): Promise<number | null> {
    return this.claims.get(discordId) ?? null;
  }

  async setDiscordClaim(discordId: string, at: number): Promise<void> {
    this.claims.set(discordId, at);
  }

  async consumeRate(bucket: string, at: number, windowSeconds: number): Promise<RateSnapshot> {
    const id = `${bucket}:${windowSeconds}`;
    const current = this.rates.get(id);
    if (!current || current.windowStart + windowSeconds * 1000 <= at) {
      const next = { windowStart: at, count: 1 };
      this.rates.set(id, next);
      return { ...next };
    }
    current.count += 1;
    return { ...current };
  }

  async peekRate(bucket: string, at: number, windowSeconds: number): Promise<number> {
    const current = this.rates.get(`${bucket}:${windowSeconds}`);
    if (!current || current.windowStart + windowSeconds * 1000 <= at) {
      return 0;
    }
    return current.count;
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    this.audit.push({ ...entry });
  }
}
