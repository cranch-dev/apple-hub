import { verifyAsync } from "@noble/ed25519";
import type { Context } from "hono";
import type { AppEnv } from "../app-env";
import { claimFreeKey } from "../domain/key-service";
import { hexToBytes } from "../lib/crypto";

const EPHEMERAL = 64;

interface DiscordUser {
  id?: string;
}

interface DiscordInteraction {
  type?: number;
  data?: { name?: string };
  member?: { user?: DiscordUser };
  user?: DiscordUser;
}

function utc(ms: number): string {
  return `${new Date(ms).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

function reply(content: string): Response {
  return Response.json({ type: 4, data: { content, flags: EPHEMERAL } });
}

function helpText(origin: string): string {
  return [
    "**Apple Hub**",
    `1. Jalankan loader di executor:\n\`loadstring(game:HttpGet("${origin}/loader"))()\``,
    "2. Masukkan key saat diminta. Key tersimpan per perangkat.",
    "3. Klaim key gratis dengan `/key` (berlaku 24 jam, 1 perangkat).",
    "",
    "Key terikat ke perangkat pada pemakaian pertama. Ganti perangkat? Minta admin reset edge.",
  ].join("\n");
}

async function verifySignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const message = new TextEncoder().encode(timestamp + body);
    return await verifyAsync(hexToBytes(signatureHex), message, hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

export async function handleDiscord(c: Context<AppEnv>): Promise<Response> {
  const publicKey = c.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    return c.json({ error: "discord_disabled", message: "DISCORD_PUBLIC_KEY belum diset." }, 503);
  }

  const raw = await c.req.text();
  const signature = c.req.header("x-signature-ed25519");
  const timestamp = c.req.header("x-signature-timestamp");
  if (!signature || !timestamp) {
    return c.text("unauthorized", 401);
  }
  if (!(await verifySignature(publicKey, signature, timestamp, raw))) {
    return c.text("unauthorized", 401);
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(raw) as DiscordInteraction;
  } catch {
    return c.text("bad_request", 400);
  }

  if (interaction.type === 1) {
    return c.json({ type: 1 });
  }

  const origin = new URL(c.req.url).origin;
  if (interaction.type !== 2) {
    return reply("Interaksi ini tidak didukung.");
  }

  const name = interaction.data?.name;
  if (name === "help") {
    return reply(helpText(origin));
  }
  if (name !== "key") {
    return reply("Perintah tidak dikenal. Coba `/key` atau `/help`.");
  }

  const discordId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!discordId) {
    return reply("Tidak bisa membaca identitas Discord kamu.");
  }

  const now = c.get("now")();
  const claim = await claimFreeKey(c.get("store"), discordId, now);
  if (!claim.ok) {
    return reply(
      `Kamu sudah klaim key hari ini. Klaim berikutnya: **${utc(claim.nextClaimAt)}**.`,
    );
  }

  const key = claim.key.record;
  const lines = [
    "**Key Apple Hub kamu**",
    `\`${claim.key.plaintext}\``,
    "",
    `Tier: **${key.tier}**`,
    `Berlaku sampai: **${key.expiresAt ? utc(key.expiresAt) : "selamanya"}**`,
    `Perangkat: **${key.maxEdges}** (terkunci saat dipakai pertama kali)`,
    "",
    "Simpan key ini — hanya ditampilkan sekali.",
    `Klaim berikutnya: ${utc(claim.nextClaimAt)}`,
    "",
    `Loader: \`loadstring(game:HttpGet("${origin}/loader"))()\``,
  ];
  return reply(lines.join("\n"));
}
