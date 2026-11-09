#!/usr/bin/env bun
type Flags = Record<string, string | boolean>;
type Json = Record<string, unknown>;

const API = (Bun.env.APPLEHUB_API ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
const TOKEN = Bun.env.APPLEHUB_ADMIN_TOKEN ?? "";

const USAGE = `Apple Hub admin CLI

Pemakaian:
  bun run apps/cli/src/index.ts key create --tier premium --days 30 --edges 2 [--discord ID] [--note "..."] [--lifetime]
  bun run apps/cli/src/index.ts key list [--query PREFIX|DISCORD|ID] [--limit 20]
  bun run apps/cli/src/index.ts key show <id>
  bun run apps/cli/src/index.ts key revoke <id> [--reason "..."]
  bun run apps/cli/src/index.ts key reset-edge <id>

Env:
  APPLEHUB_API            default http://127.0.0.1:8787
  APPLEHUB_ADMIN_TOKEN    wajib, samakan dengan ADMIN_TOKEN di worker`;

function die(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseFlags(args: string[]): { positionals: string[]; flags: Flags } {
  const positionals: string[] = [];
  const flags: Flags = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split("=");
    if (inline !== undefined) {
      flags[name] = inline;
    } else if (args[index + 1] && !args[index + 1].startsWith("--")) {
      flags[name] = args[index + 1];
      index += 1;
    } else {
      flags[name] = true;
    }
  }

  return { positionals, flags };
}

function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function numberFlag(flags: Flags, name: string): number | undefined {
  const value = stringFlag(flags, name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function api(method: string, path: string, body?: unknown): Promise<Json> {
  if (!TOKEN) {
    die("APPLEHUB_ADMIN_TOKEN belum diset.");
  }

  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep raw text
  }

  if (!response.ok) {
    die(`HTTP ${response.status} ${JSON.stringify(parsed)}`);
  }
  return parsed as Json;
}

function formatTime(ms: unknown): string {
  if (typeof ms !== "number") {
    return "selamanya";
  }
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16);
}

function pad(value: unknown, width: number): string {
  return String(value ?? "").slice(0, width).padEnd(width);
}

function printKeys(keys: Json[]): void {
  if (keys.length === 0) {
    console.log("tidak ada key");
    return;
  }
  console.log(
    `${pad("ID", 10)} ${pad("PREFIX", 9)} ${pad("TIER", 8)} ${pad("EDGES", 5)} ${pad("EXPIRES", 17)} ${pad("STATUS", 9)} DISCORD`,
  );
  for (const key of keys) {
    const status = key.revoked_at ? "revoked" : "active";
    console.log(
      `${pad(String(key.id).slice(0, 8), 10)} ${pad(key.prefix, 9)} ${pad(key.tier, 8)} ${pad(key.edges, 5)} ${pad(formatTime(key.expires_at), 17)} ${pad(status, 9)} ${key.discord_id ?? ""}`,
    );
  }
}

async function main(): Promise<void> {
  const [group, command, ...rest] = Bun.argv.slice(2);
  const { positionals, flags } = parseFlags(rest);

  if (!group || group === "help" || group === "--help") {
    console.log(USAGE);
    return;
  }

  if (group !== "key") {
    die(`perintah tidak dikenal: ${group}`);
  }

  if (command === "create") {
    const tier = stringFlag(flags, "tier") === "premium" ? "premium" : "free";
    const body: Json = {
      tier,
      edges: numberFlag(flags, "edges"),
      discord_id: stringFlag(flags, "discord"),
      note: stringFlag(flags, "note"),
    };

    if (flags.lifetime === true) {
      body.lifetime = true;
    } else {
      const days = numberFlag(flags, "days");
      if (days !== undefined) {
        body.days = days;
      }
    }

    const created = await api("POST", "/v1/admin/keys", body);
    console.log("key dibuat (hanya ditampilkan sekali):");
    console.log(`  key      : ${created.key}`);
    console.log(`  id       : ${created.id}`);
    console.log(`  prefix   : ${created.prefix}`);
    console.log(`  tier     : ${created.tier}`);
    console.log(`  edges    : ${created.edges}`);
    console.log(`  expires  : ${formatTime(created.expires_at)}`);
    return;
  }

  if (command === "list") {
    const params = new URLSearchParams();
    const query = stringFlag(flags, "query");
    const limit = numberFlag(flags, "limit");
    if (query) {
      params.set("query", query);
    }
    if (limit) {
      params.set("limit", String(limit));
    }
    const data = await api("GET", `/v1/admin/keys?${params.toString()}`);
    printKeys(data.keys as Json[]);
    return;
  }

  const id = positionals[0];
  if (!id) {
    die("id key wajib diisi.");
  }

  if (command === "show") {
    const data = await api("GET", `/v1/admin/keys/${encodeURIComponent(id)}`);
    const key = data.key as Json;
    console.log(`id        : ${key.id}`);
    console.log(`prefix    : ${key.prefix}`);
    console.log(`tier      : ${key.tier}`);
    console.log(`edges     : ${key.edges}`);
    console.log(`discord   : ${key.discord_id ?? "-"}`);
    console.log(`created   : ${formatTime(key.created_at)}`);
    console.log(`expires   : ${formatTime(key.expires_at)}`);
    console.log(`revoked   : ${key.revoked_at ? formatTime(key.revoked_at) : "-"}`);
    console.log(`users     : ${data.distinct_users}`);
    console.log("");
    const redemptions = data.redemptions as Json[];
    if (redemptions.length === 0) {
      console.log("belum ada perangkat terikat");
    } else {
      for (const redemption of redemptions) {
        console.log(
          `- hwid ${String(redemption.hwid_hash).slice(0, 12)}  user ${redemption.user_id ?? "-"}  last ${formatTime(redemption.last_seen_at)}`,
        );
      }
    }
    return;
  }

  if (command === "revoke") {
    const data = await api("POST", `/v1/admin/keys/${encodeURIComponent(id)}/revoke`, {
      reason: stringFlag(flags, "reason") ?? null,
    });
    console.log(data.ok ? "key dicabut" : JSON.stringify(data));
    return;
  }

  if (command === "reset-edge") {
    const data = await api("POST", `/v1/admin/keys/${encodeURIComponent(id)}/reset-edge`, {});
    console.log(`key tereset, ${data.removed} perangkat dilepas`);
    return;
  }

  console.log(USAGE);
  die(`perintah tidak dikenal: key ${command ?? ""}`);
}

main().catch((error) => {
  die(error instanceof Error ? error.message : String(error));
});
