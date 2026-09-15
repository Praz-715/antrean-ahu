# ANTREAN

> **Kelola Antrean. Layani Lebih Cepat.**

Queue Management System (QMS) yang generik dan dapat dikonfigurasi — dipakai untuk rumah sakit, instansi
pemerintahan, bank, mall, kampus, event, workshop, atau kebutuhan antrean apa pun. Jenis layanan, formulir
pengunjung, halaman publik, dan layar display semuanya dibuat oleh administrator, bukan di-hardcode.

Spesifikasi lengkap ada di [`baca.md`](baca.md); rencana & status pengerjaan ada di [`phase.md`](phase.md).

---

## Teknologi

| Lapisan | Pilihan |
|---|---|
| Framework | Nuxt 4 (Vue 3, TypeScript strict, Nitro) |
| UI | Nuxt UI v4 + Tailwind CSS v4, pemilih warna Pickr (`UiColorPicker`) |
| Database | MySQL 8+ / innovation, Prisma 7 (driver adapter MariaDB) |
| Auth | Better Auth (email/password, sesi cookie) + RBAC tabel sendiri |
| Realtime | Socket.IO di dalam proses Nitro (WebSocket + fallback polling) |
| Validasi | Zod 4 (skema dipakai bersama server & klien) |
| Waktu | Day.js (UTC di database, tampilan mengikuti timezone event) |
| Test | Vitest (integrasi memakai database MySQL sungguhan) |

---

## Menjalankan

### 1. Prasyarat

- Node.js 22+
- MySQL 8+ (atau jalankan lewat Docker)

```bash
# opsional: MySQL lewat Docker
docker run -d --name antrean-mysql \
  -e MYSQL_ROOT_PASSWORD=root123 \
  -e MYSQL_DATABASE=antrean \
  -p 3306:3306 mysql:8
```

### 2. Instalasi

```bash
npm install
cp .env.example .env      # lalu sesuaikan DATABASE_URL dan secret
```

Isi minimal `.env`:

```env
DATABASE_URL="mysql://root:root123@127.0.0.1:3306/antrean"
BETTER_AUTH_SECRET=<hasil: openssl rand -base64 32>
APP_ENCRYPTION_KEY=<hasil: openssl rand -hex 32>
APP_URL=http://localhost:3000
```

### 3. Database

```bash
npm run db:migrate     # buat skema
npm run db:seed        # data contoh + akun demo
```

### 4. Jalankan

```bash
npm run dev            # http://localhost:3000
```

---

## Akun Demo

> ⚠️ Hanya untuk development. **Ganti seluruh password sebelum dipakai sungguhan.**

| Peran | Email | Password | Akses |
|---|---|---|---|
| Super Admin | `superadmin@antrean.local` | `password123` | Seluruh sistem |
| Operator 1 | `operator1@antrean.local` | `password123` | Pelayanan Umum · Loket 1 |
| Operator 2 | `operator2@antrean.local` | `password123` | Pelayanan Khusus · Loket 2 |

Halaman publik contoh: `http://localhost:3000/p/demo2026`

---

## Alur Coba Cepat

1. Masuk sebagai **superadmin** → `/admin/dashboard`.
2. Buka `/admin/displays`, buat display "Lobby Utama", lalu buka tautannya di tab/layar terpisah.
3. Buka `/p/demo2026` di ponsel atau tab lain → pilih layanan → isi form → dapat nomor `A001`.
4. Masuk sebagai **operator1** di jendela lain → `/operator` → tekan **Panggil Berikutnya**.
5. Layar display berubah seketika dan membacakan nomor; halaman pengunjung berganti jadi "Nomor Anda dipanggil".

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` / `npm run preview` | Build & pratinjau produksi |
| `npm run db:migrate` | Buat & terapkan migrasi (development) |
| `npm run db:deploy` | Terapkan migrasi (produksi) |
| `npm run db:seed` | Isi data contoh (idempoten) |
| `npm run db:seed:prod` | Seed minimal untuk instalasi baru (kata sandi acak, dicetak sekali) |
| `npm run db:studio` | Prisma Studio |
| `npm run test` | Seluruh test (unit + integrasi) |
| `npm run smoke:api` | Sapu 55 endpoint pada server yang sedang berjalan |
| `npm run smoke:browser` | Uji perilaku nyata di browser (Playwright) |
| `npm run smoke:phase5` | Uji media library, playlist, dan display builder |
| `npm run smoke:phase6` | Uji analytics, laporan, ekspor, dan audit log |
| `npm run smoke:phase7` | Uji pengaturan, rating, integrasi data source, dan autofill |
| `npm run smoke:phase8` | Uji penjadwal otomatis, header keamanan, rate limit, unggahan |
| `npm run smoke:voice` | Uji suara panggilan di layar **memakai data nyata** (event, halaman publik, akun operator): nada dari Media Library, nada bawaan sistem, mode "hanya nada", suara Google Translate, dan dua panggilan beruntun pada satu layar — menambah 5 nomor ke papan hari ini |
| `npm run load-test` | Uji beban ringan: 2.000 antrean + 200 display |
| `npm run ux-audit` | Audit Function/UI/UX lewat peramban: responsif, kontras, aksesibilitas, umpan balik |
| `npm run typecheck` | Pemeriksaan tipe |
| `npm run lint` / `lint:fix` | ESLint |

Seluruh skrip uji menuruti `SMOKE_BASE`, jadi suite yang sama bisa diarahkan ke **hasil
build**, bukan hanya ke server dev:

```bash
npm run build
# jalankan hasil build (BETTER_AUTH_URL & APP_URL harus sama dengan origin yang dipakai)
PORT=3100 NODE_ENV=production APP_URL=http://127.0.0.1:3100 \
  BETTER_AUTH_URL=http://127.0.0.1:3100 node .output/server/index.mjs

SMOKE_BASE=http://127.0.0.1:3100 npm run smoke:api
SMOKE_BASE=http://127.0.0.1:3100 npm run ux-audit
```

Origin wajib cocok: Better Auth menolak permintaan dari origin di luar `BETTER_AUTH_URL`
dengan `INVALID_ORIGIN` — bukan cacat build, melainkan penjaga CSRF yang memang bekerja.

Pada Git Bash (Windows), jalankan dengan `MSYS_NO_PATHCONV=1`: tanpa itu nilai env yang
diawali garis miring (mis. `STORAGE_PUBLIC_BASE=/media`) diubah menjadi path Windows dan
URL berkas media jadi salah.

---

## Struktur

```
app/        antarmuka (halaman, komponen, composable, layout)
server/     API Nitro, service, realtime, utilitas
shared/     tipe, skema Zod, konstanta — dipakai kedua sisi
prisma/     schema, migrasi, seed
tests/      unit & integrasi
docs/       dokumentasi API dan WebSocket
```

Arah ketergantungan satu arah, tidak boleh dilangkahi:

```
page/component → composable → server/api (handler tipis) → service → repository/prisma
```

Handler API hanya memvalidasi input, memanggil service, lalu membungkus hasil.
Tidak ada query Prisma di dalam handler, tidak ada business logic di dalam `.vue`.

---

## Rute

**Publik (tanpa login)**

| Rute | Fungsi |
|---|---|
| `/p/{publishCode}` | Ambil nomor antrean |
| `/queue/{token}` | Lacak status antrean (realtime) |
| `/display/{deviceCode}` | Layar antrean (realtime + suara + tombol layar penuh) |

**Terproteksi**

| Rute | Fungsi |
|---|---|
| `/login` | Masuk |
| `/operator` | Dashboard operator (termasuk panggil biasa & panggil prioritas) |
| `/admin/dashboard` | Ringkasan harian |
| `/admin/events`, `/admin/queue-types`, `/admin/counters` | Konfigurasi layanan |
| `/admin/live-queue`, `/admin/queue-history` | Pemantauan antrean |
| `/admin/operators`, `/admin/assignments` | Pengguna & penugasan |
| `/admin/public-pages`, `/admin/forms` | Publikasi & form builder |
| `/admin/displays`, `/admin/announcements` | Perangkat display & teks berjalan |
| `/admin/media`, `/admin/display-builder` | Media library (gambar, video, **audio**), playlist & penyusun tata letak layar (termasuk widget **Nomor per Loket** & **Data Pengunjung**) |
| `/admin/analytics`, `/admin/reports`, `/admin/audit-logs` | Grafik, laporan harian, pusat ekspor & jejak audit |
| `/admin/visitors`, `/admin/feedback` | Data pengunjung & moderasi rating/testimoni |
| `/admin/integrations`, `/admin/settings`, `/admin/roles` | Sumber data eksternal, pengaturan sistem, role & izin |

Setiap halaman — termasuk beranda, login, halaman pengunjung, halaman tiket, panel
operator, layar display, dan halaman galat — punya **sakelar tema terang/gelap**
(`UiThemeToggle`). Pilihannya tersimpan per peramban dan bertahan lintas halaman.
Layar display tetap **gelap secara bawaan** (dibaca dari jauh di ruang tunggu);
tampilannya berubah terang hanya bila pengguna memang memilih tema terang.

---

## Dokumentasi Lain

- [docs/API.md](docs/API.md) — seluruh endpoint REST beserta contoh
- [docs/WEBSOCKET.md](docs/WEBSOCKET.md) — kanal realtime, payload, dan otentikasi
- [phase.md](phase.md) — rencana implementasi, ERD, dan status per phase
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — pemasangan di server, env produksi, reverse proxy, cadangan
- [docs/AUDIT.md](docs/AUDIT.md) — hasil audit fungsi beserta perbaikannya

---

## Catatan Penting

- **Waktu.** Database menyimpan UTC. Tanggal layanan (`service_date`) dihitung pada timezone *event*,
  bukan timezone server — sehingga reset nomor harian tetap benar walau server berada di zona lain.
  Pada raw SQL selalu gunakan `UTC_TIMESTAMP(3)`, jangan `NOW()`.
- **Nomor antrean.** Dihasilkan lewat `INSERT ... ON DUPLICATE KEY UPDATE` pada tabel `queue_counters`
  di dalam transaksi — tidak pernah `MAX(sequence)+1`. Unique constraint
  `(event, jenis, tanggal, urutan)` menjadi jaring pengaman terakhir.
- **Pemanggilan antrean.** `SELECT … FOR UPDATE SKIP LOCKED` + `UPDATE … WHERE status='WAITING'`
  memastikan dua operator tidak mungkin mendapat nomor yang sama.
- **Realtime.** Karena Socket.IO menempel pada proses Nitro, aplikasi harus dijalankan sebagai
  server Node (bukan serverless/edge). Untuk banyak instance, tambahkan Redis adapter.
- **Media.** Berkas divalidasi lewat magic byte, bukan nama atau Content-Type, lalu disimpan di
  `storage/uploads` dan disajikan pada `/media/**`. Ganti driver di `server/utils/storage.ts`
  bila nanti pindah ke S3/MinIO — pemanggilnya tidak perlu berubah.
- **Display builder.** Tata letak digambar pada kanvas 1920×1080 lalu diskalakan ke layar.
  Pratinjau builder dan layar sungguhan memakai komponen yang sama (`DisplayRenderer`), jadi
  yang dilihat admin memang yang akan tampil.
- **Tanggal di antarmuka.** Filter dan laporan memakai tanggal pada zona waktu *event*
  (`shared/utils/service-date.ts`), bukan UTC — kalau tidak, setiap pukul 17.00 WIB ke atas
  rentang tanggalnya meleset satu hari.
- **Ekspor.** Pekerjaan berjalan di latar belakang lewat tabel `export_jobs`; klien memantau
  statusnya lalu mengunduh. CSV ditulis dengan BOM UTF-8 agar Excel di Windows membacanya benar.
- **Pengaturan sistem.** Satu katalog di `shared/constants/settings.ts` dipakai server (validasi &
  nilai bawaan), antarmuka (formulir dirender otomatis), dan kode fitur. Sebagian kunci boleh
  ditimpa per event lewat `events.settings`, sehingga satu organisasi bisa punya aturan berbeda
  per layanan tanpa membuat organisasi baru.
- **Integrasi data source.** Kredensial disimpan terenkripsi AES-256-GCM dan tidak pernah
  dikembalikan ke klien. Permintaan keluar dijaga di `server/utils/ssrf.ts`: nama host diresolusi
  lalu ALAMATNYA yang diperiksa, alamat internal ditolak, redirect tidak diikuti, ada batas waktu
  dan batas ukuran respons. Pengunjung hanya menerima nilai yang dipetakan ke field formulir —
  respons mentah pihak ketiga tidak pernah diteruskan.
- **Penjadwal.** Status event diselaraskan dengan jadwalnya tiap menit
  (`server/plugins/scheduler.ts`). Berjalan di dalam proses, jadi bila nanti dijalankan lebih dari
  satu instance, nyalakan hanya pada salah satunya (`SCHEDULER_ENABLED=false` pada sisanya).
- **Pengunjung yang kembali tidak disuruh mendaftar ulang.** Token antrean yang sudah
  diambil diingat di peramban pengunjung (per halaman publik), lalu diperiksa ulang ke
  server saat halaman dibuka: yang sudah selesai, dibatalkan, atau milik hari lain
  dilupakan diam-diam. Membuka layanan yang nomornya sudah dimiliki menampilkan nomor
  itu — bukan formulir kosong — dengan "Registrasi Kembali" sebagai pilihan kedua.

- **Operator → loket, loket → layanan (§12, §28).** Operator didudukkan di satu loket; loket itulah
  yang menentukan layanan yang ia tangani, dan karena loket milik satu event, "satu operator satu
  event" terjaga oleh struktur. Penempatan baru ditolak bila operatornya sudah duduk di loket
  lain; pemindahan harus diminta eksplisit (`moveFromOtherCounter`) dan ditolak selama ia masih
  memegang antrean berjalan. Satu loket boleh melayani beberapa layanan sekaligus — panel operator
  menampilkannya sebagai bilah pemilih layanan. Loket tanpa layanan tidak bisa ditempati, dan
  layanan loket tidak bisa dikosongkan selama masih ada operator di sana. Konsekuensinya skrip uji
  membuat operator + loketnya sendiri — bukan memakai akun operator demo bersama.
- **Suara panggilan punya empat sumber (§22).** `browser` memakai suara yang terpasang di
  perangkat layar — gratis dan tanpa internet, tetapi kualitasnya berbeda-beda per perangkat.
  `gtranslate` memakai mesin TTS Google Translate: gratis, tanpa kunci API, dan menyeragamkan
  suara seluruh layar. Alamatnya disusun sendiri di `server/utils/google-translate-tts.ts` —
  paket `google-tts-api` sengaja TIDAK dipakai karena satu-satunya yang dibutuhkan darinya
  hanyalah perangkaian query itu, sementara ia menyeret `axios` 0.21 bercelah tinggi dan sudah
  tidak dirawat sejak 2022. Perlu diketahui: jalur Translate itu tidak resmi dan bisa dibatasi
  Google per alamat IP, karena itu layar selalu jatuh ke suara peramban bila permintaannya
  gagal. `external` untuk layanan TTS berbayar milik sendiri, `chime` hanya membunyikan nada
  tanpa membacakan nomor. Daftar nilainya hidup di satu tempat (`VOICE_PROVIDERS`) dan dipakai
  katalog pengaturan sekaligus penimpa per-event — dulu keduanya punya daftar sendiri, dan
  menambah sumber baru di salah satunya membuat penimpaan per-event ditolak tanpa pesan jelas.
- **Satu panggilan = satu suara (§22).** Saat operator memanggil dua kali beruntun, pengumuman
  kedua memotong berkas suara yang pertama. Pemutaran yang dipotong dilaporkan sebagai
  `diganti`, BUKAN `gagal` (`useCallSound`), dan tiap pengumuman memegang nomor urut sehingga
  hanya yang terbaru boleh bersuara — tanpa dua pembedaan itu, panggilan pertama menganggap
  dirinya gagal lalu mengulang nomornya dengan suara peramban tepat saat berkas nomor kedua
  berbunyi: satu-satunya penyebab "suara dobel" yang dilaporkan di lapangan. Suara peramban
  kini hanya dipakai bila pemutaran benar-benar gagal. Panel operator pun tidak lagi ikut
  membacakan nomor secara bawaan (bisa dinyalakan per perangkat, diingat di `localStorage`) —
  satu ruangan dengan layar dan panel operator sebelumnya mendengar nomor yang sama dua kali.
  Dijaga oleh dua pemeriksaan terakhir `npm run smoke:voice`.
- **Pagar lokasi halaman publik (§36).** Halaman bisa dikunci agar hanya terbuka dalam radius
  tertentu dari satu titik — diatur di tab **Lokasi** pada builder, lengkap dengan penguraian
  tautan Google Maps dan tombol "Lokasi saya". Diperiksa di SERVER pada setiap endpoint publik,
  bukan disembunyikan di antarmuka; pengunjung di luar jangkauan menerima layar verifikasi berisi
  jarak dan tautan peta, tanpa daftar layanan maupun formulir. Koordinat pengunjung dipakai untuk
  menghitung jarak lalu dibuang — tidak ada kolom yang menyimpannya. Dua hal yang mudah terlewat:
  header `Permissions-Policy` hanya membuka `geolocation=(self)` pada `/p/**` dan
  `/admin/public-pages/**`, dan peramban hanya mengizinkan pembacaan lokasi lewat HTTPS
  (localhost dikecualikan). Pagar ini menahan, bukan mengunci: koordinat berasal dari peramban
  pengunjung dan bisa dipalsukan aplikasi GPS palsu.
- **Satu halaman publik, dua alamat.** `/p/w8j4hz76` memakai kode publikasi: itulah yang
  dicetak sebagai QR, dan "Ganti tautan & QR" menggantinya sehingga cetakan lama mati.
  `/p/layanan-ahu-kuningan-city` memakai slug pilihan admin dan tidak pernah berubah sendiri,
  jadi aman ditempel di situs atau dibagikan lewat pesan. Seluruh endpoint publik menerima
  keduanya (`server/utils/public-page-lookup.ts`), dan ingatan "nomor saya" di peramban dikunci
  pada kode publikasi supaya nomor yang diambil lewat QR tetap terlihat saat halaman yang sama
  dibuka lewat tautan tetap.
- **Halaman pangkal (`/`) bisa diarahkan (§49).** Pengaturan `system.landing` di
  `/admin/settings` menentukan apa yang dilihat orang yang mengetik alamat utama tanpa
  memegang tautan atau QR: halaman sambutan seperti bawaan, daftar kartu semua halaman publik
  yang terbit (lengkap dengan status buka), atau langsung dialihkan ke satu event. Pilihan
  per-event tumbuh sendiri mengikuti event yang PUNYA halaman terbit — event yang halamannya
  masih draf tidak ditawarkan, dan bila halaman yang dipilih kemudian ditarik dari publikasi,
  halaman pangkal kembali ke sambutan alih-alih mengalihkan ke halaman mati.
- **Halaman publik & builder-nya (§48).** Tampilan halaman pengunjung disusun di
  `/admin/public-pages/{id}`: panel setelan di atas, pratinjau halaman sungguhan di bawah.
  Pratinjaunya bukan tiruan — yang digambar komponen yang sama persis dengan yang dilihat
  pengunjung (`app/components/public/PageRenderer.vue`), hanya dengan prop `preview` yang
  mematikan tombolnya. Perendernya memakai kueri wadah (`@container`), bukan lebar jendela,
  sehingga pratinjau ponsel benar-benar memakai tata letak ponsel; halaman dirender pada lebar
  perangkat aslinya lalu diperkecil dengan `transform: scale`. Seluruh setelan tampilan hidup
  di kolom `public_pages.theme` yang sudah ada, divalidasi skema bersama — tidak ada kolom atau
  tabel baru, dan halaman yang sudah terbit tetap tampil apa adanya.
- **Captcha geser (§36).** Halaman masuk selalu, dan pengambilan nomor antrean bila dinyalakan
  pada formulir aktif di `/admin/forms`. Dijalankan sendiri oleh server ini — tidak perlu kunci
  dari layanan luar seperti Turnstile. Kedua gambarnya (latar berlubang dan potongannya) dibuat
  di server oleh encoder PNG kecil di `server/utils/png.ts`; posisi lubang tidak pernah dikirim
  ke peramban. Jawaban yang pas ditukar dengan tiket sekali pakai yang terikat pada alamat IP dan
  keperluannya, jadi tiket dari halaman publik tidak bisa dipakai untuk masuk. Pemeriksaannya ada
  di sisi server (`server/middleware/login-captcha.ts` dan `publicPageService.register`),
  sehingga mengubah halaman di peramban tidak melewatkannya.
  Uji otomatis membuka jawabannya lewat `GET /api/captcha/answer`, yang hanya hidup bila
  `CAPTCHA_DEV_BYPASS=1` DAN `NODE_ENV` bukan `production` — di luar itu endpoint-nya 404.
- **Arti status event.** Penutupan harian mengembalikan event ke `SCHEDULED`, bukan `CLOSED`.
  Pembukaan otomatis hanya menyentuh event `SCHEDULED`, jadi menandainya `CLOSED` akan membuat
  layanan harian berhenti selamanya setelah satu kali tutup. `CLOSED` disimpan untuk akhir yang
  sebenarnya: melewati tanggal berakhir, tidak punya hari layanan lain, atau ditutup admin —
  dan event `CLOSED` tidak pernah disentuh lagi oleh penjadwal.
- **Header keamanan.** CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, dan HSTS
  (produksi) dipasang oleh `server/middleware/security-headers.ts` — ikut ke mana pun aplikasi
  dijalankan, termasuk saat dev.
- **Waktu relatif.** Label seperti "5 menit lalu" WAJIB memakai `useNow()`, bukan `Date.now()`
  langsung di render. Server dan klien merender pada detik yang berbeda, dan Vue melaporkannya
  sebagai mismatch hidrasi — yang di produksi berarti sebagian DOM dibuang lalu digambar ulang.
- **Warna pilihan admin sebagai warna teks.** Lewat `useReadableColor()`, bukan langsung
  `:style="{ color: qt.color }"`. Warna pekat di atas kartu gelap hanya mencapai ±2,5:1;
  helper ini menerangkannya sampai memenuhi 4,5:1 tanpa mengubah identitas warnanya.
- **Tombol ikon-saja wajib punya `aria-label`** (dan sebaiknya `title`). Tanpa itu pembaca layar
  hanya mengucapkan "tombol"; `npm run ux-audit` memeriksanya di seluruh halaman.
