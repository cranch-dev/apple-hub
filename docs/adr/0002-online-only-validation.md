# 0002 — Validasi online saja, tanpa mode offline

## Status

Diterima.

## Konteks

Hub berjalan di executor dan tetap hidup saat koneksi user terputus sebentar. Pilihan yang dipertimbangkan: (a) validasi hanya saat launch lalu jalan selamanya, (b) cache hasil validasi dengan masa tenggang offline, (c) validasi saat launch + revalidasi berkala tanpa toleransi offline.

## Keputusan

Validasi saat launch dan setiap 30 menit. Kalau server tidak bisa dihubungi, revalidasi itu diabaikan dan Hub tetap jalan. Kalau server menjawab `revoked`, `expired`, `unknown`, atau `edge_limit`, Hub berhenti.

## Konsekuensi

- Key yang dicabut berhenti bekerja maksimal 30 menit kemudian, bukan seketika.
- Tidak ada file cache yang bisa dimodifikasi untuk melewati validasi.
- User dengan internet putus-putus tidak ditendang keluar.
- Fitur yang butuh respons instan saat revoke (mis. chargeback) tidak bisa dijamin; itu diterima.
