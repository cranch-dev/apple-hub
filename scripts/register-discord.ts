const appId = Bun.env.DISCORD_APP_ID;
const botToken = Bun.env.DISCORD_BOT_TOKEN;

if (!appId || !botToken) {
  console.error("DISCORD_APP_ID dan DISCORD_BOT_TOKEN wajib diset.");
  process.exit(1);
}

const commands = [
  {
    name: "key",
    description: "Ambil key gratis Apple Hub (24 jam, 1 perangkat)",
    type: 1,
  },
  {
    name: "help",
    description: "Cara memakai Apple Hub",
    type: 1,
  },
];

const response = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: "PUT",
  headers: {
    authorization: `Bot ${botToken}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(commands),
});

const text = await response.text();
if (!response.ok) {
  console.error(`gagal mendaftarkan command (HTTP ${response.status}): ${text}`);
  process.exit(1);
}

console.log("command terdaftar:", text);
