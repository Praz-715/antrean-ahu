# LAPORAN AKHIR PENGEMBANGAN DAN IMPLEMENTASI
## Sistem Antrean Digital — ANTREAN AHU

**Klien:** Direktorat Jenderal Administrasi Hukum Umum (Ditjen AHU)
**Pelaksana:** PT Yasatech Sinergi Inspirasi
**Periode pekerjaan:** 14 – 25 September 2026
**Tanggal laporan:** 23 September 2026
**Acuan:** [Dokumen Rencana Pengembangan dan Implementasi Sistem Antrean AHU](Dokumen_Rencana_Pengembangan_dan_Implementasi_Sistem_Antrean_AHU.md)

---

## 1. Ringkasan Eksekutif

Sistem Antrean AHU telah dibangun dan dipasang pada server pra-produksi. Seluruh modul yang
disebut dalam dokumen rencana — pengambilan antrean publik (online dan onsite), dashboard
operator, display antrean realtime, pelaporan dan ekspor, QR Code, rating kepuasan, serta
administrasi dan konfigurasi — sudah berfungsi dan diuji secara internal.

Konfigurasi layanan Ditjen AHU sudah terpasang penuh: **8 layanan** (Apostille, Perdata, Badan
Usaha, Kewarganegaraan, Legalisasi, Prioritas, Konsultasi Apostille & Legalisasi, dan Atensi)
dengan **9 loket** yang dipetakan sesuai hasil validasi alur layanan tanggal 14 September 2026.

Yang **sudah selesai**: pengembangan seluruh modul, pengujian internal/SIT, deployment ke server
pra-produksi beserta database dan migrasi, konfigurasi layanan dan loket, halaman publik beserta
QR, dan display antrean.

Yang **masih menunggu pihak AHU**: server dan domain produksi final, integrasi mesin antrean
existing, serta konfirmasi perangkat display di lokasi. Rincian dan dampaknya ada pada
Bagian 10.

Tahap berikutnya adalah UAT bersama stakeholder AHU. Laporan ini **tidak memuat hasil UAT** —
skenario, evidence, dan acceptance dicatat pada dokumen UAT tersendiri sesuai daftar deliverable
pada dokumen rencana.

---

## 2. Ruang Lingkup Laporan

Laporan ini mencakup tahapan **Development → Testing/SIT → Deployment → Implementasi (kesiapan
Go-Live)**. Pelaksanaan UAT dan hasilnya berada di luar cakupan dokumen ini.

| Tahapan | Periode (rencana) | Status |
|---|---|---|
| Assessment | 14 September 2026 | Selesai |
| Development | 15 – 18 September 2026 | Selesai |
| Testing / SIT internal | 18 – 22 September 2026 | Selesai |
| Deployment pra-produksi | 21 – 22 September 2026 | Selesai |
| Konfigurasi layanan & perangkat | 22 – 23 September 2026 | Selesai sebagian — menunggu perangkat lokasi |
| UAT bersama AHU | 24 – 25 September 2026 | Belum dilaksanakan (di luar laporan ini) |
| Go-Live | Mengikuti hasil UAT | Menunggu |

---

## 3. Arsitektur Sistem

### 3.1 Tumpukan teknologi

| Lapisan | Teknologi | Versi |
|---|---|---|
| Framework aplikasi | Nuxt (Vue 3) | 4.4 |
| Antarmuka | Nuxt UI, Tailwind CSS | 4.11 / 4.x |
| Server | Nitro (Node.js) | Node 22 LTS |
| Basis data | MySQL / MariaDB | 8.0+ |
| ORM & migrasi | Prisma + adapter MariaDB | 7.10 |
| Realtime | Socket.IO | 4.8 |
| Autentikasi | better-auth (email + sandi, sesi server) | 1.7 |
| Validasi | Zod (dipakai bersama oleh klien dan server) | 4.5 |
| Ekspor | ExcelJS (XLSX) dan CSV internal | 4.4 |
| QR Code | qrcode | 1.5 |
| Pengujian | Vitest (unit & integrasi), Playwright (menggerakkan aplikasi sungguhan) | 4.1 / 1.63 |

### 3.2 Bentuk penyebaran

Satu proses Node menjalankan aplikasi web, API, dan server realtime sekaligus; satu basis data
MySQL; satu direktori penyimpanan berkas media; seluruhnya di belakang reverse proxy yang
menangani HTTPS.

```
[Pengunjung]  ──HTTPS──┐
[Operator]    ──HTTPS──┤
[Layar TV]    ──HTTPS──┼──▶ [Reverse Proxy] ──▶ [Node: Nuxt + API + Socket.IO] ──▶ [MySQL]
                       │                                   │
                       │                                   └──▶ [storage/uploads: media & hasil ekspor]
```

Socket.IO menempel pada proses yang sama dengan aplikasi, sehingga sistem **harus** berjalan
sebagai server Node — bukan platform serverless yang mematikan proses antar-permintaan, karena
koneksi realtime display tidak akan bertahan di sana.

### 3.3 Prinsip rancangan yang memengaruhi operasional

- **Tanggal layanan, bukan tanggal kalender server.** Nomor antrean dikelompokkan per tanggal
  layanan yang dihitung pada zona waktu event, sehingga server boleh berjalan di UTC tanpa
  mengacaukan penomoran harian.
- **Penomoran aman terhadap operator paralel.** Pengambilan nomor berikutnya memakai penguncian
  baris basis data (`SELECT … FOR UPDATE SKIP LOCKED`), sehingga dua operator yang menekan
  "Panggil Berikutnya" bersamaan tidak akan mendapat nomor yang sama.
- **Penghapusan halus (soft delete).** Layanan, pengguna, dan halaman yang dihapus tetap tersimpan
  agar riwayat dan laporan lama tidak berubah.
- **Konfigurasi, bukan kode.** Jenis layanan, format nomor, loket, formulir, tampilan halaman
  publik, tata letak display, dan aturan antrean diatur dari panel admin tanpa mengubah kode atau
  melakukan deployment ulang.

---

## 4. Modul yang Dikembangkan

Mengikuti daftar modul pada dokumen rencana.

| Modul | Fungsi yang tersedia | Status |
|---|---|---|
| Public / Visitor | Halaman publik per QR, pilihan layanan, formulir dinamis, nomor antrean, halaman status antrean, rating/feedback | Selesai |
| Queue Management | Jenis antrean, prefix dan format nomor, tanggal layanan, status antrean, kuota menunggu | Selesai |
| Operator | Panggil berikutnya, panggil ulang, mulai layani, lewati, selesai, tidak hadir, batalkan, panggil nomor prioritas, daftar menunggu dan dilewati, riwayat | Selesai |
| Priority Queue | Penanda prioritas, pemanggilan langsung, urutan prioritas didahulukan | Selesai |
| Atensi | Halaman/QR khusus, antrean internal, tidak tampil pada display publik | Selesai |
| Display | Display realtime, nomor sedang dilayani, loket, penanda prioritas, suara/TTS, builder tata letak, media dan playlist | Selesai |
| Dashboard | Total antrean, menunggu, sedang dilayani, selesai, dilewati, dibatalkan, rata-rata waktu tunggu dan waktu layanan, kepuasan, serta grafik volume per jam | Selesai |
| Reporting | Filter tanggal/layanan/operator, statistik per layanan termasuk jumlah nomor hangus, laporan harian siap cetak, ekspor Excel/CSV | Selesai |
| Administration | Pengguna dan role, jenis antrean, event/sesi, penempatan operator, display, media, pengaturan sistem, audit log | Selesai |

Cakupan teknis: **31 halaman** aplikasi dan **117 endpoint** API, di atas **12 migrasi** basis data.

---

## 5. Pemenuhan Requirement Khusus Ditjen AHU

Tabel berikut memetakan setiap requirement khusus pada dokumen rencana ke wujud implementasinya.

| Requirement | Implementasi | Status |
|---|---|---|
| **Formulir** — nomor telepon dan email wajib tersedia; keperluan mandatory | Formulir dinamis dengan empat isian wajib: Nama, Email, Nomor HP, Keperluan. Divalidasi di sisi pengunjung (tanda centang per isian, peringatan sebelum tombol ambil nomor) dan divalidasi ulang di server | Terpenuhi |
| **Reporting** — detail per layanan, filtering, jumlah pemohon, kepuasan, ekspor harian Excel | Laporan harian siap cetak, filter tanggal/layanan/operator, statistik per layanan, grafik sebaran per jam, dan Pusat Ekspor (Riwayat Antrean, Daftar Pengunjung, Performa Operator, Rating & Testimoni) ke **XLSX** dan **CSV** | Terpenuhi |
| **Prioritas** — flag pada display; operator dapat memanggil langsung | Nomor prioritas ditandai lencana **PRIORITAS** pada display dan papan operator; urutan pemanggilan mendahulukan prioritas; operator dapat memanggil nomor prioritas langsung dari daftar menunggu | Terpenuhi |
| **Atensi** — QR khusus, hanya onsite, tidak tampil pada display publik | Halaman publik terpisah `/p/khusus-atensi` yang hanya memuat layanan Atensi; layar publik disetel hanya menampilkan layanan terpilih sehingga nomor Atensi tidak muncul, namun tetap tercatat untuk monitoring dan laporan internal | Terpenuhi |
| **QR Online** — QR statis dengan geotagging radius maksimal 1 km | Setiap halaman publik memiliki **QR statis** (tautan slug, tetap) dan **QR dinamis** (kode publikasi, dapat dicabut). Pagar lokasi tersedia dengan titik koordinat dan radius yang dapat diatur; radius terpasang 1.000 m | Terpenuhi — lihat catatan aktivasi pada Bagian 10 |
| **QR Onsite** — QR khusus untuk pengambilan di lokasi | Halaman publik onsite tersendiri dengan QR-nya sendiri, terpisah dari kanal online | Terpenuhi |
| **Antrean Terlewat** — terlewat 3 nomor, pemohon mengambil nomor baru, disclaimer pada tiket | Nomor yang sudah dilewati sejumlah panggilan tertentu otomatis menjadi **Hangus** dan pengunjung diminta mengambil nomor baru. Ambang batasnya diatur di menu Pengaturan (bawaan **3 nomor**). Tiket pengunjung memuat disclaimer beserta sisa tenggang | Terpenuhi |
| **Loket Prioritas** — dapat melayani semua layanan | Loket 4 melayani Prioritas dan Badan Usaha; Loket 9 melayani seluruh layanan | Terpenuhi |
| **Mesin Existing** — second display dan walk-in printing | Belum diintegrasikan; menunggu informasi antarmuka mesin dari pihak AHU | Menunggu |
| **Server & Domain** — detail server, domain, dan PIC | Sistem berjalan di server pra-produksi milik pelaksana; domain final menunggu keputusan AHU | Menunggu |

### 5.1 Konfigurasi 8 layanan yang terpasang

| Kode | Layanan | Tampil di display publik |
|---|---|---|
| AP | Apostille | Ya |
| PD | Perdata | Ya |
| BU | Badan Usaha | Ya |
| KN | Kewarganegaraan | Ya |
| L | Legalisasi | Ya |
| P | Prioritas | Ya, dengan penanda prioritas |
| AL | Konsultasi Apostille dan Legalisasi | Sesuai pengaturan tiap layar |
| AT | Atensi | **Tidak** — sesuai permintaan AHU |

### 5.2 Pemetaan loket yang terpasang

| Loket | Layanan yang dilayani |
|---|---|
| 1 | Apostille, Konsultasi Apostille & Legalisasi, Atensi |
| 2 | Apostille, Konsultasi Apostille & Legalisasi, Atensi |
| 3 | Perdata, Atensi |
| 4 | Prioritas, Badan Usaha, Atensi |
| 5 | Badan Usaha, Atensi |
| 6 | Kewarganegaraan, Atensi |
| 7 | Kewarganegaraan, Atensi |
| 8 | Legalisasi, Konsultasi Apostille & Legalisasi, Atensi |
| 9 | Seluruh layanan |

Sesuai catatan operasional pada dokumen rencana, **seluruh loket dapat melayani Atensi**.

---

## 6. Aturan Bisnis yang Diimplementasikan

### 6.1 Status antrean

| Status | Arti | Dipicu oleh |
|---|---|---|
| Menunggu | Nomor sudah terbit, belum dipanggil | Pengunjung mengambil nomor |
| Dipanggil | Nomor sedang dipanggil ke loket | Operator menekan Panggil Berikutnya atau memanggil nomor tertentu |
| Dilayani | Pemohon sudah berada di loket | Operator menekan Mulai Layani |
| Selesai | Layanan selesai | Operator menekan Selesai |
| Dilewati | Sudah dipanggil tetapi pemohon tidak hadir | Operator menekan Lewati |
| Tidak Hadir | Ditandai tidak hadir oleh operator | Operator |
| Dibatalkan | Dibatalkan beserta alasannya | Operator/pengawas |
| **Hangus** | Terlewat sejumlah nomor dan tidak berlaku lagi | Otomatis oleh sistem |

### 6.2 Aturan nomor hangus (antrean terlewat)

Sebuah nomor dihitung "terlewat" oleh nomor lain pada layanan dan tanggal yang sama yang sudah
dipanggil, urutannya berada di belakang nomor tersebut, dan bukan merupakan panggilan prioritas.
Ketika hitungannya mencapai ambang batas (bawaan **3**), nomor berubah menjadi **Hangus**.

Dua keputusan rancangan yang perlu diketahui bagian operasional:

1. **Panggilan prioritas tidak menghanguskan nomor biasa.** Nomor prioritas memang didahulukan;
   pemegang nomor biasa belum kehilangan gilirannya, hanya tertunda.
2. **Hangus bersifat final.** Nomor yang hangus tidak dapat dipanggil kembali, karena tiket
   pengunjung sudah menyatakan nomor tersebut tidak berlaku lagi. Pemohon yang telanjur datang
   tetap dilayani melalui nomor barunya, dan riwayatnya tercatat sebagai dua baris.

Tiket pengunjung memuat kalimat: *"Mohon tetap berada di ruang tunggu. Nomor Anda hangus bila
petugas sudah memanggil 3 nomor sesudah nomor Anda, dan Anda perlu mengambil nomor baru."*
Angka pada kalimat tersebut mengikuti pengaturan, bukan ditulis tetap di dalam teks.

### 6.3 Pembatasan pengambilan nomor

| Mekanisme | Perilaku | Dapat diatur pada |
|---|---|---|
| Pagar lokasi (geotagging) | Menolak pengambilan nomor dari luar radius titik lokasi | Tiap halaman publik: titik koordinat dan radius (terpasang 1.000 m) |
| Kuota per perangkat/IP per hari | Membatasi jumlah nomor dari satu alamat IP per hari | Tiap halaman publik; nilainya perlu dipastikan kembali sebelum Go-Live |
| Kuota antrean menunggu | Menolak nomor baru saat antrean sudah terlalu panjang | Tiap layanan dan pengaturan global |
| Jam layanan | Menolak nomor di luar jam operasional | Jadwal event per hari |
| Captcha | Verifikasi keamanan sebelum nomor terbit | Tiap formulir; captcha geser bawaan, Cloudflare Turnstile opsional |

---

## 7. Keamanan dan Kontrol Akses

| Aspek | Implementasi |
|---|---|
| Autentikasi | Email dan sandi dengan sesi server; durasi sesi dapat diatur |
| Otorisasi | RBAC dengan 4 role bawaan (Superadmin, Admin, Operator, Viewer) dan lebih dari 40 izin granular yang dapat disusun ulang per role |
| Pembatasan operator | Operator hanya dapat menyentuh antrean pada loket tempat ia ditempatkan; pengawas lintas layanan memerlukan izin khusus |
| Audit | Tindakan penting tercatat lengkap (pelaku, tindakan, entitas, data lama/baru, waktu) dan dapat ditelusuri di menu Audit Log |
| Pembatasan laju | Endpoint publik dibatasi per alamat IP (bawaan 20 permintaan per menit) |
| Perlindungan formulir publik | Captcha geser bawaan, opsi Cloudflare Turnstile, pagar lokasi, dan kuota harian per IP |
| Kerahasiaan kredensial integrasi | Disimpan terenkripsi AES-256-GCM dengan kunci dari variabel lingkungan |
| Perlindungan SSRF | Integrasi data eksternal menolak alamat internal kecuali di-allowlist secara eksplisit |
| Transport | HTTPS wajib di produksi; cookie `Secure` dan HSTS aktif saat `NODE_ENV=production` |

---

## 8. Pengujian

### 8.1 Pengujian otomatis

| Jenis | Jumlah | Cakupan |
|---|---|---|
| Unit | 9 berkas | Perhitungan jarak geofence, tema halaman publik, pemetaan sumber data, captcha geser, proteksi SSRF, pengaturan tiket, TTS, pencarian halaman publik, pengaturan halaman root |
| Integrasi | 6 berkas | Registrasi publik, otorisasi operator, cakupan operator per loket, konkurensi pemanggilan, reset harian, aturan nomor hangus |
| **Total** | **15 berkas / 144 pengujian** | Seluruhnya lulus pada eksekusi terakhir, 22 September 2026 |

Selain itu, setiap perubahan diverifikasi dengan pemeriksaan gaya penulisan kode (`lint`) dan
pemeriksaan tipe (`typecheck`) yang harus bersih sebelum pekerjaan dianggap selesai.

### 8.2 Pengujian sistem (SIT) internal

Pengujian dilakukan dengan menjalankan aplikasi sungguhan dan menggerakkannya seperti pengguna
melalui otomasi peramban, bukan hanya memanggil API.

| Skenario | Hasil |
|---|---|
| Registrasi online dan onsite melalui halaman publik | Nomor terbit sesuai layanan dan format |
| Validasi isian wajib sebelum verifikasi keamanan | Isian kosong ditolak dengan penanda pada tiap isian |
| Pemanggilan oleh operator: berikutnya, ulang, lewati, selesai | Berfungsi; status dan display ikut berubah seketika |
| Dua operator memanggil bersamaan | Tidak pernah mendapat nomor yang sama |
| Aturan nomor hangus (terlewat 3 nomor) | Nomor berubah menjadi Hangus tepat pada panggilan ketiga; tiket menampilkan pemberitahuan dan tombol ambil nomor baru |
| Panggilan prioritas terhadap nomor biasa | Tidak menghanguskan nomor biasa |
| Display realtime | Nomor, loket, penanda prioritas, dan suara panggilan berfungsi |
| Atensi tidak tampil pada display publik | Terverifikasi |
| QR statis dan QR dinamis | Isi kedua QR terbukti berbeda dan sesuai alamat masing-masing |
| Laporan dan ekspor | Laporan harian dan ekspor XLSX/CSV terbentuk dan dapat diunduh |
| Uji beban ringan registrasi | **120 pendaftaran** (20 per layanan) melalui endpoint publik, seluruhnya berhasil tanpa kegagalan |

### 8.3 Temuan internal yang telah diperbaiki

| Temuan | Perbaikan |
|---|---|
| Nomor antrean sulit dibaca pada layar bertema gelap | Warna teks dihitung ulang agar memenuhi kontras WCAG AA |
| Suara panggilan memerlukan klik manual di display | Suara diaktifkan otomatis; indikator hanya muncul bila peramban memblokir |
| Display menyebut layanan yang tidak ditampilkan di layar tersebut | Pemanggilan suara disaring mengikuti layanan pada layar |
| Jenis antrean yang dihapus masih tersisa di loket dan menimbulkan galat | Penghapusan ditolak selama masih dipakai loket, disertai nama loketnya |
| Email pengguna yang sudah dihapus tidak dapat dipakai lagi | Alamat dilepas saat penghapusan sehingga dapat didaftarkan ulang |
| Perubahan sebagian (PATCH) menimpa kolom yang tidak dikirim | Skema pembaruan diperbaiki agar hanya menulis kolom yang benar-benar dikirim |
| Berkas media yang sedang dipakai dapat terhapus | Penghapusan ditolak dan pustaka menampilkan di mana berkas itu dipakai |
| Tombol "panggil nomor ini" memungkinkan pelompatan antrean | Tombol dihapus dari daftar menunggu; pendahuluan hanya melalui tombol prioritas |
| Event dan jenis antrean tidak dapat dihapus karena nomor yang tertinggal menunggu dari hari-hari sebelumnya | Penjagaan "masih ada antrean aktif" dibatasi pada tanggal layanan berjalan, sesuai maksud aturannya |
| Angka antrean pada kartu event menghitung seluruh riwayat sehingga kehilangan arti | Kartu menampilkan antrean hari ini; total sepanjang masa tetap ada di halaman detail event |

### 8.4 Catatan keamanan yang perlu ditindaklanjuti

Satu temuan **belum diperbaiki** dan memerlukan keputusan bersama:

> Kuota harian per perangkat dihitung dari alamat IP yang dibaca melalui header
> `X-Forwarded-For`. Header tersebut saat ini dipercaya apa adanya, sehingga kuota harian dapat
> dilewati oleh pengirim yang menyetel header itu sendiri. Perbaikannya adalah membaca alamat IP
> hanya dari reverse proxy tepercaya. Dampaknya terbatas pada penyalahgunaan kuota pengambilan
> nomor, bukan pada kebocoran data.

---

## 9. Deployment

### 9.1 Kebutuhan lingkungan produksi

| Komponen | Minimal |
|---|---|
| Node.js | 22 LTS |
| MySQL | 8.0+ (membutuhkan `FOR UPDATE SKIP LOCKED` dan `CONVERT_TZ`) |
| RAM | 1 GB; 2 GB bila banyak layar display terhubung |
| Disk | 5 GB ditambah ruang untuk media dan hasil ekspor |
| Jaringan | HTTPS melalui reverse proxy; koneksi WebSocket harus diteruskan |

### 9.2 Langkah deployment yang dijalankan

1. Menyiapkan basis data MySQL beserta pengguna basis data khusus, bukan `root`.
2. Mengisi variabel lingkungan produksi — `APP_URL`, `BETTER_AUTH_SECRET`, `APP_ENCRYPTION_KEY`,
   `DATABASE_URL`, dan batas unggahan — tanpa menaruh satu pun kredensial di dalam kode sumber.
3. Menjalankan migrasi produksi (`npm run db:deploy`) — 12 migrasi.
4. Membangun aplikasi (`npm run build`) dan menjalankannya sebagai layanan systemd.
5. Memasang reverse proxy dengan HTTPS dan penerusan WebSocket.
6. Melakukan health check dan verifikasi akses dari jaringan luar.

**Catatan proses:** perintah build kini menjalankan `prisma generate` lebih dahulu. Ini menutup
satu kelas kegagalan deployment yang sempat terjadi — direktori klien Prisma tidak ikut dalam
repositori, sehingga deployment yang hanya menjalankan build memakai klien lama dan menolak kolom
yang baru ditambahkan.

### 9.3 Status lingkungan

| Lingkungan | Alamat | Status |
|---|---|---|
| Pra-produksi (pelaksana) | `https://antrean.tegwa.my.id` | Aktif, dipakai untuk pengujian dan demo |
| Produksi (AHU) | Menunggu penetapan domain dan server | Belum tersedia |

Halaman publik yang sudah terbit pada lingkungan pra-produksi:

| Kanal | Alamat | Keterangan |
|---|---|---|
| Publik onsite | `/p/af8p23j8` | Kode publikasi untuk QR dinamis di lokasi |
| Publik online | `/p/galeri-inovasi-ahu` | Tautan slug tetap untuk QR statis |
| Atensi | `/p/khusus-atensi` | Hanya memuat layanan Atensi |

### 9.4 Cadangan dan pemulihan

Prosedur cadangan basis data dan pemulihan tercantum pada [Panduan Deployment](DEPLOYMENT.md) dan
harus dijadwalkan pada server produksi sebelum Go-Live, bersama pencadangan direktori
`storage/uploads` yang memuat berkas media dan hasil ekspor.

---

## 10. Hal yang Masih Menunggu Konfirmasi AHU

| No. | Item | Dampak bila belum selesai | Dibutuhkan dari AHU |
|---|---|---|---|
| 1 | Server produksi: spesifikasi, OS, IP, storage, akses deployment, PIC | Sistem masih berjalan di server pelaksana; Go-Live belum dapat dilakukan di lingkungan AHU | Penetapan server dan akses |
| 2 | Domain produksi dan sertifikat SSL | QR yang dicetak saat ini menunjuk domain pra-produksi dan harus dicetak ulang setelah domain final ditetapkan | Domain final beserta DNS |
| 3 | Aktivasi pagar lokasi pada halaman online | Titik koordinat dan radius 1 km **sudah terpasang namun pagar belum diaktifkan**, sehingga nomor online masih dapat diambil dari luar lokasi | Konfirmasi titik koordinat resmi dan persetujuan pengaktifan |
| 4 | Integrasi mesin antrean existing | Fungsi second display dan pencetakan walk-in belum tersedia | Informasi antarmuka/komunikasi mesin |
| 5 | Perangkat display di lokasi | Jumlah layar, resolusi, audio, dan penempatan belum final | Konfirmasi perangkat dan lokasi pemasangan |
| 6 | Jaringan lokasi | Akses dari perangkat internal serta kebutuhan whitelist/firewall belum dipastikan | Konfirmasi tim jaringan AHU |
| 7 | Penggantian kredensial akun uji | Akun demo masih memakai sandi awal yang tercantum pada dokumen rencana | Penetapan sandi baru sebelum Go-Live |
| 8 | Pengembalian kuota per IP pada halaman publik | Kuota sempat dinaikkan untuk keperluan uji beban dan perlu dikembalikan ke nilai operasional | Penetapan angka kuota harian yang berlaku |

---

## 11. Status Tahapan Pekerjaan

Mengikuti tabel tahapan pada dokumen rencana.

| Phase | Kegiatan | Status |
|---|---|---|
| Development | Design sistem | Selesai |
| Development | Development sistem antrean | Selesai |
| Development | Development dashboard/operator | Selesai |
| Development | Development display nomor antrean | Selesai |
| Development | Development reporting | Selesai |
| Testing | Internal Testing / SIT | Selesai |
| Testing | Penemuan bug dan perbaikan hasil testing | Selesai; rekapitulasi pada Bagian 8.3 |
| Deployment | Persiapan deployment | Selesai untuk pra-produksi; produksi menunggu server AHU |
| Deployment | Deployment sistem | Selesai untuk pra-produksi |
| Deployment | Konfigurasi perangkat / display / jaringan | Sebagian; menunggu perangkat lokasi |
| Go-Live | Go-Live sistem | Menunggu hasil UAT dan server produksi |
| Go-Live | Monitoring awal penggunaan sistem | Belum dimulai |
| UAT | Persiapan, pelaksanaan, dokumentasi, dan perbaikan hasil UAT | Di luar cakupan laporan ini |

---

## 12. Serah Terima

### 12.1 Dokumen yang diserahkan

| Dokumen | Isi |
|---|---|
| [Laporan Akhir](laporan_akhir.md) | Dokumen ini — pengembangan sampai implementasi |
| [Panduan Pengguna](user_guide.md) | Panduan pengunjung, operator loket, admin, dan layar antrean |
| [Panduan Deployment](DEPLOYMENT.md) | Kebutuhan server, variabel lingkungan, build, proxy, cadangan |
| [Dokumentasi API](API.md) | Seluruh endpoint beserta parameter dan bentuk responsnya |
| [Dokumentasi Realtime](WEBSOCKET.md) | Kanal dan peristiwa Socket.IO |
| [Dokumentasi Audit](AUDIT.md) | Cakupan pencatatan audit |

### 12.2 Langkah berikutnya

1. Penetapan server dan domain produksi oleh Ditjen AHU.
2. Deployment ke lingkungan produksi AHU beserta migrasi dan penjadwalan cadangan.
3. Pengaktifan pagar lokasi dan pencetakan ulang QR pada domain final.
4. Penggantian sandi seluruh akun operator dan admin.
5. Pelaksanaan UAT bersama stakeholder AHU sesuai skenario pada dokumen rencana, dengan hasilnya
   dicatat pada dokumen UAT tersendiri.
6. Go-Live dan monitoring awal penggunaan sistem.

---

## 13. Persetujuan

| Pihak | Nama | Tanggal | Tanda Tangan |
|---|---|---|---|
| Tim Pengembang — PT Yasatech Sinergi Inspirasi | | | |
| PIC Ditjen AHU | | | |
| Perwakilan User/AHU | | | |
