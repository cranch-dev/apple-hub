# Apple Hub

Hub script Roblox berbasis executor dengan sistem key terpusat: Key Service di Cloudflare Worker + D1, bot Discord untuk key gratis, CLI admin, dan Hub Luau yang mengambil modul per-game.

## Arsitektur

```
executor
  └─ loader  ──GET──>  /loader            (BASE di-inject dari origin request)
       │                /vendor/windui.lua
       │                /v1/validate       (key + hwid + user_id)
       └─ Hub core ────>  /v1/manifest      (daftar game + versi + sha256)
            │              /v1/modules/<file>
            └─ Modul game  (tab + fitur, menerima ctx)
```

- **Loader** (`packages/loader/loader.luau`) memuat WindUI, memasang service key `applehub` ke `WindUI.Services`, dan membiarkan KeySystem bawaan WindUI menangani input + `SaveKey`. Setelah key valid, loader mengambil Hub core.
- **Hub core** (`packages/hub/init.luau`) menampilkan kartu sesi, memvalidasi ulang tiap 30 menit, dan memuat modul sesuai `game.GameId`.
- **Modul** (`packages/hub/games/*.luau`) hanya mendaftarkan UI dan fitur; semuanya lewat `ctx`, tanpa `getgenv()`.
- **Worker** (`apps/worker`) melayani API, aset Luau, admin, dan interaksi Discord dalam satu deployable.
- **D1** menyimpan hash key, redemption per HWID, rate limit, klaim Discord, dan audit log.

## Struktur repo

```
apps/worker/            Worker: API, aset, admin, Discord
  migrations/           Skema D1
  test/                 Tes bun:test
apps/cli/               CLI admin
packages/loader/        Loader Luau
packages/hub/           Hub core + modul per game
vendor/windui.lua       WindUI 1.6.66 (di-vendor, jangan diedit)
scripts/gen-hub.ts      Membuat apps/worker/src/generated/hub.ts
docs/adr/               Keputusan arsitektur
GLOSSARY.md             Istilah domain
```

`apps/worker/src/generated/hub.ts` dihasilkan oleh `bun run gen` (dipanggil otomatis oleh `dev`, `test`, `deploy`). Jangan edit manual.

## Setup

Prasyarat: Bun, akun Cloudflare, dan `wrangler` sudah login.

```bash
bun install
bun run gen
bun run db:migrate:local
cp .dev.vars.example apps/worker/.dev.vars   # lalu isi ADMIN_TOKEN
cp .env.example .env                         # untuk CLI
bun run dev
```

`bun run dev` menjalankan `wrangler dev` di `http://127.0.0.1:8787`.

Smoke test:

```bash
curl -s localhost:8787/health
curl -s localhost:8787/v1/manifest
```

## CLI admin

```bash
# key gratis 1 hari, 1 perangkat
bun run apps/cli/src/index.ts key create --tier free

# key premium 30 hari, 2 perangkat
bun run apps/cli/src/index.ts key create --tier premium --days 30 --edges 2 --discord 123456789 --note "vip"

# key premium lifetime
bun run apps/cli/src/index.ts key create --tier premium --lifetime

bun run apps/cli/src/index.ts key list
bun run apps/cli/src/index.ts key show <id>
bun run apps/cli/src/index.ts key revoke <id> --reason "chargeback"
bun run apps/cli/src/index.ts key reset-edge <id>
```

Env CLI: `APPLEHUB_API` (default `http://127.0.0.1:8787`) dan `APPLEHUB_ADMIN_TOKEN`.

## Discord

1. Buat application di Discord Developer Portal.
2. Ambil **Public Key**, simpan sebagai secret Worker: `bunx wrangler secret put DISCORD_PUBLIC_KEY`.
3. Buat bot, isi `.env` lokal:

   ```bash
   DISCORD_APP_ID=...
   DISCORD_BOT_TOKEN=...
   ```

4. Daftarkan slash command: `bun run discord:register`.
5. Set **Interactions Endpoint URL** ke `https://<worker>/discord/interactions`.

Perintah: `/key` (key gratis 24 jam, 1 perangkat, cooldown 24 jam per Discord ID) dan `/help`.

## Deploy

```bash
bun run gen
bunx wrangler d1 migrations apply applehub --remote
bunx wrangler secret put ADMIN_TOKEN
bunx wrangler secret put DISCORD_PUBLIC_KEY
bun run deploy
```

Setelah deploy, loader tersedia di `https://<worker>/loader`. Bagikan:

```lua
loadstring(game:HttpGet("https://<worker>/loader"))()
```

`<worker>` adalah subdomain `*.workers.dev` atau domain kustom yang nanti dipasang.

## Tes

```bash
bun run typecheck
bun run test
```

Tes Worker memakai `MemoryStore`, jadi tidak butuh D1. Untuk memeriksa sintaks Luau:

```bash
luau packages/loader/loader.luau
luau packages/hub/init.luau
luau packages/hub/games/10767824942.luau
```

Error runtime seperti `attempt to index nil with 'GetService'` berarti sintaks valid (tidak ada `game` di CLI). Uji end-to-end di Roblox: LinusWare/Sober di Linux, lalu satu perangkat Android sebelum rilis.

## Menambah game

1. Tambahkan entri di `packages/hub/games.json` (`universe_id`, `name`, `module`, `min_tier`, `enabled`).
2. Buat `packages/hub/games/<file>.luau` yang mengembalikan `{ init = function(ctx) ... end }`.
3. Jalankan `bun run gen` lalu deploy.

`ctx` berisi: `window`, `windui`, `state`, `tier`, `alive()`, `notify(title, content)`, `log(...)`.

## Model ancaman

Proteksi yang dipilih adalah **deterrence**, bukan anti-tamper:

- Key check selalu di server; tidak ada secret di client.
- Modul bersifat publik dan tidak diobfuscate; yang dijaga adalah akses lewat validasi key, bukan isi modul.
- Tidak ada mode offline: validasi saat launch dan tiap 30 menit.
- WindUI, loader, dan config tersimpan di perangkat user, jadi user yang teknis bisa mem-patch client. Menerima ini adalah keputusan sadar (lihat ADR 0002 dan 0003).

Rate limit: 10 validasi/menit dan 100/jam per IP, 30/jam per HWID, plus kunci 15 menit setelah 20 kegagalan per IP.

## Belum ada (sengaja)

- Ad-gate (Linkvertise/work.ink) — ditambahkan setelah ada traffic.
- Dashboard web — CLI + slash command dulu.
- Pembayaran otomatis — key premium dibuat manual.
