# 0003 — Gating fitur di Hub, modul bersifat publik

## Status

Diterima.

## Konteks

Alternatifnya: setiap modul game diobfuscate, atau key divalidasi ulang setiap kali modul diunduh lewat URL bertanda tangan. Keduanya menambah biaya (obfuscator berbayar, token sesi, rotasi rahasia) dan tetap bisa diakali karena kode berjalan di mesin user.

## Keputusan

File modul dapat diunduh siapa saja yang tahu URL-nya. Hak akses ditentukan oleh payload `/v1/validate` (`tier`, `expires_at`) dan diperiksa Hub sebelum modul dimuat. `manifest.json` juga publik.

## Konsekuensi

- Siapa pun bisa membaca modul dan mem-patch Hub agar melewati pengecekan. Ini konsekuensi sadar dari level deterrence yang dipilih.
- Eksperimen dan kontribusi modul jadi mudah karena tidak ada langkah build/obfuscate.
- Kalau nanti butuh proteksi lebih, titik perubahan yang jelas: tambahkan session token berumur pendek dan gate `/v1/modules/:file` di Worker.
- `sha256` per modul tetap ada di manifest untuk integritas dan ETag, bukan sebagai kontrol akses.
