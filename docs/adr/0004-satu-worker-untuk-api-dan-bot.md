# 0004 — Satu Worker untuk API dan bot Discord

## Status

Diterima.

## Konteks

Bot Discord bisa dijalankan sebagai gateway bot di VPS (butuh proses hidup terus, reconnect, dan biaya bulanan) atau sebagai endpoint HTTP interactions yang dipanggil Discord.

## Keputusan

Bot memakai HTTP interactions di Worker yang sama dengan API. Tidak ada VPS, tidak ada gateway, dan deploy bot = deploy Worker.

## Konsekuensi

- Verifikasi tanda tangan Ed25519 wajib dan harus selesai di bawah 3 detik; D1 cukup cepat untuk satu insert.
- `DISCORD_PUBLIC_KEY` menjadi secret Worker; token bot hanya dipakai script pendaftaran command di mesin lokal.
- Tidak bisa memakai fitur gateway (presence, event pesan biasa). Untuk `/key` dan `/help` itu tidak diperlukan.
- Kalau nanti butuh auto-role atau moderasi berbasis event, bot gateway terpisah harus ditambahkan.
