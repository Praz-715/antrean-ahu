# Hasil Audit Fungsi

**Audit: 5 September 2026 · Perbaikan: 6 September 2026 · Status: seluruh temuan selesai**

Audit dilakukan setelah Phase 0–4, dengan tiga cara:

1. **Sapu endpoint** — `npm run smoke:api` mengeksekusi 53 jalur tulis/baca termasuk kasus yang harus ditolak.
2. **Uji browser sungguhan** — `npm run smoke:browser` (Playwright) menguji perilaku yang tidak terlihat dari sisi server.
3. **Pengukuran biaya query** — delta `SHOW GLOBAL STATUS LIKE 'Questions'` per request, dan `Com_update` untuk menghitung tulisan.

## Ringkasan

| Kategori | Temuan | Status |
|---|---|---|
| Bug membuat fitur mati diam-diam | 4 | ✅ selesai |
| Data / metrik keliru | 3 | ✅ selesai |
| Masalah performa | 5 | ✅ selesai |
| Fungsi ada tapi tak terjangkau UI | 6 | ✅ selesai |
| Kode mati | 8 simbol | ✅ dihapus |

Verifikasi akhir: 53/53 endpoint · 7/7 uji browser · 27/27 test integrasi · typecheck & ESLint bersih.

Yang sejak awal sudah benar: seluruh aturan izin & penolakan (duplikat kode, transisi status ilegal, halaman
belum terbit, opsi SELECT tak dikenal, hapus akun sendiri, pairing ganda), proteksi CSRF Better Auth,
penomoran antrean atomik, dan `FOR UPDATE SKIP LOCKED` pada pemanggilan antrean.

---

## A. Bug yang membuat fitur mati diam-diam

### A1. Realtime display berhenti bekerja setelah pairing pertama ✅

**Masalah.** `app/pages/display/[deviceCode].vue` menyusun objek auth socket saat *setup*, sedangkan
`deviceToken` baru dibaca dari `localStorage` di `onMounted`. Token yang benar-benar terkirim selalu
`undefined`. Selama perangkat belum dipasangkan tidak terlihat; begitu `deviceTokenHash` terisi, server
menolak handshake dan layar diam-diam turun ke polling 10 detik — selamanya.

**Perbaikan.** `useSocket()` kini menerima `auth` berupa fungsi, sehingga nilainya dibaca tepat sebelum
koneksi dibuka, plus opsi `manual` supaya halaman display bisa menyelesaikan pairing lebih dulu baru
memanggil `connect()`. Penolakan server juga tidak lagi senyap: status berubah menjadi
**PERLU PAIRING ULANG** beserta alasannya di footer.

**Bukti.** `npm run smoke:browser`:
```
OK  display kunjungan pertama: pairing + ONLINE   — token tersimpan
OK  display sesudah dipasangkan: tetap ONLINE     — socket tersambung memakai token tersimpan
OK  nomor dipanggil muncul di layar tanpa reload  — U001
```

### A2. `requireCaptcha` tidak pernah ditegakkan ✅

**Masalah.** Kolom ada, API mengirimnya, checkbox admin ada — tetapi tidak ada satu baris pun yang
memverifikasi token. Administrator menyalakan setelan yang tidak berefek apa pun.

**Perbaikan.** `server/utils/captcha.ts` memverifikasi token Cloudflare Turnstile, dipanggil
`publicPageService.register()` sebelum apa pun menyentuh database. Widget dirender di halaman publik saat
halaman mewajibkannya. Sengaja **gagal-tertutup**: bila kunci belum dipasang, permintaan ditolak dengan
pesan jelas, bukan diloloskan diam-diam. Checkbox di admin dinonaktifkan selama `TURNSTILE_SITE_KEY` kosong.

**Bukti.** Menyalakan captcha tanpa kunci:
`CAPTCHA_REQUIRED: Verifikasi anti-bot belum dikonfigurasi pada server. Hubungi administrator.`

### A3. Field HIDDEN tampil, field FILE tidak berfungsi ✅

**Masalah.** Halaman publik memetakan tipe yang tidak dikenal ke `<input type="text">`, sehingga `HIDDEN`
tampil sebagai input berlabel dan `FILE` menjadi kotak teks tanpa mekanisme unggah.

**Perbaikan.** `HIDDEN` disaring dari render tetapi nilai bawaannya tetap dikirim. `FILE` menampilkan
keterangan "Unggah berkas belum tersedia", dan di palet form builder tipenya dikunci sampai media library
(Phase 5) selesai — jadi tidak bisa lagi membuat field yang tidak berfungsi.

**Bukti.** `OK  field HIDDEN tidak tampil ke pengunjung — tersembunyi seperti seharusnya`

### A4. Grafik "Volume per Jam" memakai jam UTC ✅

**Masalah.** `HOUR(created_at)` pada raw SQL, sedangkan kolom disimpan UTC — grafik bergeser 7 jam untuk WIB.
Antrean pukul 14:00 WIB dilaporkan sebagai `{"hour": 7}`.

**Perbaikan.** `tzOffsetString()` menurunkan offset dari timezone event, lalu
`HOUR(CONVERT_TZ(created_at, '+00:00', ?))`. Memakai offset eksplisit, bukan nama zona, supaya tidak
bergantung pada tabel `mysql.time_zone` yang biasanya kosong pada image Docker.

**Bukti.** Antrean yang sama kini dilaporkan `{"hour": 14}`, cocok dengan `HOUR(CONVERT_TZ(...))` di database.

---

## B. Data & metrik

### B1. "Total Visitor" sebenarnya menghitung antrean ✅

Diganti `COUNT(DISTINCT visitor_id)`. Satu pengunjung yang mengambil dua nomor tidak lagi dihitung dua kali.

### B2. `valueNumber` / `valueDate` tidak pernah diisi ✅

Kini diisi **berdasarkan tipe field**, bukan menebak dari isinya — penting karena `"081234567890"` tampak
seperti angka padahal nomor HP, dan mengubahnya jadi numerik akan menghilangkan nol di depan.

Bukti dari database setelah satu pengiriman form:

| field | type | value_text | value_number | value_date |
|---|---|---|---|---|
| phone | PHONE | 081234567890 | NULL | NULL |
| umur | NUMBER | 37 | 37.0000 | NULL |
| tanggal_lahir | DATE | 1989-04-17 | NULL | 1989-04-17 00:00:00 |

### B3. NEXT menutup antrean sebelumnya sebagai COMPLETED ✅

Perilaku tombol dipertahankan (operator sudah terbiasa), tetapi tiga hal diperbaiki:

1. **Rata-rata waktu layanan** kini hanya dihitung dari antrean yang benar-benar sempat berstatus SERVING,
   sehingga antrean yang tertutup otomatis karena pengunjung tidak datang tidak lagi menggerus angka.
   Dashboard juga menampilkan `servedCount` sebagai dasar perhitungannya.
2. **Konfirmasi NEXT** menyebutkan nomor yang akan ditandai selesai, dan mengarahkan ke tombol yang benar
   bila pengunjung tidak datang.
3. **Tombol "Tidak Hadir" dan "Batalkan"** tersedia — lihat bagian D.

---

## C. Performa

Sebelum → sesudah, pada database yang sama:

| Endpoint | Sebelum | Sesudah |
|---|---|---|
| `GET /api/display/{code}/state` | 33 query | **18** |
| `GET /api/operator/board` | 27 query | 21 |
| `GET /api/admin/dashboard` | 24 query | **16** |
| `GET /api/public/{code}/status` | 22 query | **16** |
| `GET /api/admin/queues` | 16 query | **8** |
| `GET /api/me` | 14 query | **6** |
| 5× baca state display | 5 UPDATE | **0** |

### C1. N+1 pada papan antrean ✅

`queueService.publicBoard()` dulu menjalankan 4 query untuk setiap jenis antrean. Kini memakai
`groupBy` + dua query `ROW_NUMBER() OVER (PARTITION BY ...)`, sehingga jumlah query **tetap** berapa pun
banyaknya layanan.

Bukti: display dengan 3 layanan → 18 query; display dengan **10 layanan → 18 query** (sebelumnya
diperkirakan ~70).

### C2. Dashboard meloop per jenis antrean ✅

Diganti satu `groupBy [queueTypeId, status]` plus satu query antrean aktif.

### C3. Write amplification pada display ✅

`touchDevice()` membatasi penulisan `last_seen_at` menjadi maksimal sekali per 60 detik, dipakai bersama
oleh endpoint state dan heartbeat socket. Dari ~12 UPDATE/menit per display menjadi 1.

### C4. `/api/me` mahal dan dipanggil tiap navigasi ✅

Konteks role & permission di-cache 30 detik per pengguna, dan dibuang eksplisit lewat
`invalidateAuthContext()` saat pengguna, role, atau penugasannya berubah — jadi perubahan izin berlaku
seketika, tidak menunggu TTL.

### C5. `audit()` di-`await` di jalur request ✅

Ditambahkan `auditAsync()` yang mengambil konteks request lebih dulu lalu menulis tanpa ditunggu.
Seluruh 26 handler API kini memakainya.

---

## D. Fungsi yang tadinya tidak terjangkau dari UI

| Fungsi | Perbaikan |
|---|---|
| `POST /queue/{id}/serving` | Tombol **Mulai Layani** muncul saat antrean berstatus CALLED (pintasan `M`) |
| `POST /queue/{id}/no-show` | Tombol **Tidak Hadir** dengan konfirmasi |
| `POST /queue/{id}/cancel` | Tombol **Batalkan** dengan kolom alasan, tercatat di riwayat & audit |
| Announcement / running text | Modul lengkap: service, 4 endpoint, halaman `/admin/announcements` dengan pratinjau, jadwal tayang & prioritas — tersiar ke layar seketika |
| `public_pages.infoHtml` | Kolom **Informasi Layanan** di admin, dirender sebagai teks (bukan `v-html`) karena tidak ada sanitizer di sistem ini |
| Ganti event di `/admin/live-queue` | `useSocket` memakai getter + `reconnect()` saat event berganti, sehingga room lama ditinggalkan |

**Bukti.** `OK  pengumuman muncul di teks berjalan display — tanpa reload`

---

## E. Kode mati ✅

Dihapus: `emitDisplayUpdated`, `getIo`, `assertQueueTypeAccess`, `safeCompare`, `reorderSchema`,
`scheduleOverrideSchema`, `paginationSchema`. `emitAnnouncement` kini terpakai oleh modul pengumuman.
`encryptJson` / `decryptJson` dipertahankan — memang untuk Phase 7 (data source).

---

## Catatan tentang pengujian

Dua kesalahan pada skrip audit itu sendiri, sudah diperbaiki agar tidak menyesatkan lain kali:

- Node `fetch` tidak mengirim header `Origin` sementara undici tetap mengirim `sec-fetch-mode: cors`,
  sehingga Better Auth menolaknya. Itu **proteksi CSRF yang bekerja benar**, bukan bug — browser selalu
  mengirim `Origin`. Skrip kini mengirimnya.
- Uji browser sempat gagal karena event demo memang tutup pada hari Minggu. Skrip kini menyiapkan event
  ujinya sendiri (buka 24 jam) lalu membersihkannya, jadi hasilnya tidak bergantung kalender dan data demo
  tidak tersentuh.
