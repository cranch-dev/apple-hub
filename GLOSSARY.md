# Apple Hub

Hub script Roblox berbasis executor dengan sistem key terpusat.

## Language

**Hub**:
Kumpulan fitur yang dijalankan di dalam executor dan ditampilkan lewat satu UI.
_Avoid_: script, cheat, tool

**Loader**:
Script kecil yang di-`loadstring` user; tugasnya mengambil versi terbaru, memvalidasi Key, lalu menjalankan Hub.
_Avoid_: bootstrap, entrypoint

**Key Service**:
Backend yang menerbitkan, memvalidasi, dan mencabut Key.
_Avoid_: auth server, license server

**Key**:
Token rahasia yang dimasukkan user ke Hub untuk membuka akses.
_Avoid_: license, serial, code

**Redemption**:
Satu pemakaian Key pada satu perangkat.
_Avoid_: activation, login

**Tier**:
Tingkat akses yang melekat pada sebuah Key dan menentukan fitur serta batas perangkatnya.
_Avoid_: plan, level, rank

**Edge**:
Batas jumlah perangkat (HWID) tempat satu Key boleh dipakai.
_Avoid_: slot, device limit
