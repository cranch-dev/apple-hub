# 0001 — Key disimpan sebagai hash SHA-256

## Status

Diterima.

## Konteks

D1 menyimpan semua Key. Kalau plaintext disimpan, satu kebocoran database (atau akses dashboard yang salah) membocorkan seluruh inventaris Key, termasuk Key premium lifetime. Di sisi lain, admin kadang perlu menolong user yang kehilangan Key.

## Keputusan

Database hanya menyimpan `sha256(canonical_key)` dan prefix 4 karakter (`APL-XXXX`) untuk ditampilkan di daftar admin. Plaintext hanya ada satu kali: saat Key dibuat, di respons API atau pesan Discord.

## Konsekuensi

- Kehilangan Key berarti regenerasi, bukan "lihat lagi".
- Query admin memakai prefix, Discord ID, atau ID internal — bukan pencarian substring Key.
- Validasi menghitung hash atas bentuk kanonik (`APL-XXXX-XXXX-XXXX`), sehingga spasi/huruf kecil dari user tetap cocok.
