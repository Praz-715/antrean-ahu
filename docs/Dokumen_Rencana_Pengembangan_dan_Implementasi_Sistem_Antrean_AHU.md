DOKUMEN RENCANA PENGEMBANGAN DAN IMPLEMENTASI SISTEM ANTREAN

DIREKTORAT JENDERAL ADMINISTRASI HUKUM UMUM (DITJEN AHU)

Sistem Antrean Digital -- ANTREAN AHU Dokumen Scope, Tahapan Pekerjaan,
Fitur, Testing, Deployment, Go-Live, dan UAT

PT YASATECH SINERGI INSPIRASI

# Latar Belakang

Ditjen AHU membutuhkan sistem antrean yang dapat menggantikan dan
menyesuaikan sistem antrean existing, mendukung pengambilan antrean
secara onsite maupun online, pengelolaan antrean oleh operator, display
nomor antrean, fitur prioritas, antrean Atensi, serta pelaporan yang
dapat difilter dan diekspor.

Aplikasi Sistem Antrean AHU dirancang sebagai Queue Management System
yang configurable. Struktur aplikasi mencakup public queue registration,
operator dashboard, realtime display, dashboard/analytics, reporting,
audit/history, QR Code, rating, serta konfigurasi layanan.

Dokumen ini memetakan kemampuan tersebut ke kebutuhan implementasi
khusus Ditjen AHU dan menjabarkan tahapan Development → Testing/SIT →
Deployment → Go-Live → UAT.

# Tujuan

Membangun sistem antrean digital yang sesuai dengan alur layanan Ditjen
AHU.

Menggantikan sistem antrean existing dengan sistem Sistem Antrean AHU
yang dapat dikonfigurasi.

Menyediakan pengambilan antrean onsite melalui QR/mesin dan online
melalui QR statis dengan pembatasan geotagging.

Menyediakan dashboard operator untuk pemanggilan, recall, skip,
pemanggilan nomor tertentu, dan pengelolaan antrean prioritas.

Menyediakan display nomor antrean realtime dengan penanda prioritas.

Menyediakan dashboard dan reporting berdasarkan layanan, tanggal,
operator, serta indikator kepuasan pelayanan.

Melakukan testing, deployment, monitoring awal, dan UAT bersama pihak
AHU.

# Ruang Lingkup Layanan Ditjen AHU

Berdasarkan permintaan Ditjen AHU, sistem disiapkan untuk mendukung 8
kategori layanan berikut:

Catatan: Atensi sebagai layanan khusus yang di-hide dari display publik.

# Hasil Assessment dan Kondisi Existing

# Requirement Khusus Ditjen AHU

# Timeline

# Rancangan Alur Sistem

## Pengambilan Antrean Online

Pengguna mengakses QR online atau public URL.

Sistem memvalidasi lokasi/geotagging sesuai radius maksimal 1 km dari
lokasi yang ditentukan.

Pengguna memilih layanan.

Pengguna mengisi data wajib, termasuk nama, nomor telepon, email, dan
keperluan.

Sistem menghasilkan nomor antrean dan menampilkan status antrean.

Pengguna dapat memantau nomor yang sedang dipanggil dan status
antreannya.

## Pengambilan Antrean Onsite

Pengguna melakukan scan QR onsite atau menggunakan mesin existing.

Pengguna memilih layanan yang tersedia.

Pengguna mengisi data wajib.

Sistem menghasilkan nomor antrean.

Nomor antrean masuk ke antrean layanan dan dapat dipanggil operator.

## Antrean Prioritas

Antrean prioritas diberi flag/indikator khusus. Flag tersebut
ditampilkan pada display agar pengguna dan petugas dapat membedakan
antrean prioritas. Operator memiliki kemampuan memanggil antrean
prioritas secara langsung dan melakukan skip terhadap antrean sesuai
kewenangan/alur operasional yang disepakati.

## Antrean Atensi

Atensi menggunakan QR khusus dan hanya dapat digunakan onsite. Nomor
antrean Atensi tidak ditampilkan pada display publik. Pengelolaan
internal tetap tercatat dalam sistem sehingga dapat digunakan untuk
kebutuhan monitoring dan reporting internal.

# Mapping Loket

Catatan operasional: Semua loket bisa melayani Atensi.

# Tahapan Pekerjaan

# Modul Sistem yang Dikembangkan

# Development

## Development Sistem Antrean

Halaman Registrasi Antrean

Keterangan:

Pemilihan jenis layanan.

Input nama pemohon.

Input nomor telepon.

Input email.

Input keperluan.

Validasi data wajib.

Pengambilan antrean sesuai jenis layanan.

## Development Dashboard / Operator

## Development Display Nomor Antrean

## Development Reporting

## Development QR Code

## Development Administration

## Management Layanan

## Management Loket

## Management Operator

## Configuration Display

# Rencana Testing / SIT

# Testing for Demo

# Persiapan Deployment

Server aplikasi dan database dikonfirmasi oleh tim AHU.

Domain production dikonfirmasi; requirement awal meminta domain
@ahu.co.id, dengan domain final mengikuti keputusan tim AHU.

HTTPS/SSL dikonfigurasi untuk akses production.

Environment variable production disiapkan tanpa menempatkan
secret/kredensial di source code.

Database MySQL 8+ dan migration production disiapkan.

Backup database dan prosedur restore ditentukan sebelum Go-Live.

Service aplikasi dijalankan sebagai service production dan dilakukan
health check.

Display/TV, jaringan, browser/kiosk, audio, dan mesin existing diuji di
lokasi.

QR onsite, QR online, dan QR Atensi dibuat dan ditempatkan sesuai hasil
finalisasi AHU.

# UAT Bersama Ditjen AHU

UAT dilakukan bersama stakeholder AHU dengan fokus pada kesesuaian
fungsi dan alur bisnis.

Public queue dan QR online/onsite.

Geotagging dan radius 1 km untuk antrean online.

Delapan layanan/alur termasuk Prioritas dan Atensi.

Mapping loket dan assignment operator.

Display publik dan penanda antrean prioritas.

Aturan antrean terlewat 3 nomor.

Dashboard dan reporting per layanan.

Export laporan harian Excel.

Rating/kepuasan pelayanan.

Kesesuaian tampilan, teks, logo, informasi layanan, dan disclaimer.

Dokumentasi UAT minimal mencakup: tanggal, skenario, hasil,
evidence/screenshot, temuan, status perbaikan, dan acceptance
stakeholder.

# Dependency / Hal yang Masih Perlu Konfirmasi

Server production: spesifikasi, OS, IP, storage, akses deployment , dan
PIC.

Domain production: domain final dan DNS/SSL.

Jaringan: akses dari perangkat internal, internet/public access,
firewall, dan kebutuhan whitelist.

Perangkat display: jumlah TV/display, resolusi, browser/device, audio,
dan lokasi pemasangan.

Mesin existing: interface/komunikasi yang tersedia dan apakah hanya
digunakan sebagai printer/walk-in atau juga second display.

# Deliverables

# Persetujuan / Sign-Off

| No. \| Layanan \| Keterangan \|

| --- \| --- \| --- \|

| 1 \| Badan Usaha \| Antrean layanan Badan Usaha. \|

| 2 \| Apostille \| Antrean layanan Apostille. \|

| 3 \| Perdata \| Antrean layanan Perdata. \|

| 4 \| Legalasi \| Antrean layanan Legalasi. \|

| 5 \| Kewarganegaraan \| Antrean layanan Kewarganegaraan. \|

| 6 \| Konsultasi Apostille dan Legalasi \| Antrean konsultasi Apostille
  dan Legalasi. \|

| 7 \| Prioritas \| Antrean prioritas dengan flag/penanda pada display
  dan kemampuan pemanggilan langsung oleh operator. \|

| 8 \| Atensi \| Antrean khusus Atensi; hanya dapat digunakan onsite dan
  nomor tidak ditampilkan pada display publik. \|

| Aktivitas \| Tanggal \| Status \| Hasil/Temuan \|

| --- \| --- \| --- \| --- \|

| Site Survey \| 14-Sep-2026 \| Done \| Prioritas tampil di display;
  `<br>`{=html}Atensi di-hide dari display publik; `<br>`{=html}sistem
  existing akan diganti; `<br>`{=html}online queue memakai geotagging
  radius maksimal 1 km; `<br>`{=html}reporting difilter dan dapat
  menunjukkan jumlah pemohon; `<br>`{=html}opsi mesin existing untuk
  walk-in/second display. \|

| Validasi Existing \| 14-Sep-2026 \| Done \| Mesin antrean existing
  dapat mencetak nomor. Direncanakan menjadi second display dan media
  pengambilan nomor onsite bagi pemohon yang tidak dapat scan QR. \|

| Validasi Perangkat & Infrastruktur \| 14-Sep-2026 \| Waiting \|
  Informasi server dan domain masih perlu dikonfirmasi. \|

| Validasi Alur Layanan \| 14-Sep-2026 \| Done \| Loket 1--2 Apostille;
  `<br>`{=html}Loket 3 Perdata; `<br>`{=html}Loket 4 Prioritas & Badan
  Usaha; `<br>`{=html}Loket 5 Badan Usaha; `<br>`{=html}Loket 6--7
  Kewarganegaraan; `<br>`{=html}Loket 8 Legalasi; `<br>`{=html}Loket 9
  semua layanan. \|

| Area \| Requirement \|

| --- \| --- \|

| Formulir \| Nomor telepon dan email wajib tersedia; Keperluan
  mandatory. \|

| Reporting \| Laporan detail per layanan, filtering, jumlah
  pemohon/survey, kepuasan pelayanan, ekspor harian Excel. \|

| Prioritas \| Antrean prioritas memiliki flag pada display; operator
  dapat memanggil langsung dan dapat melewati antrean lain sesuai
  kebutuhan. \|

| Atensi \| QR khusus Atensi; hanya onsite; nomor Atensi tidak tampil
  pada display publik. \|

| QR Online \| QR statis untuk online queue dengan geotagging radius
  maksimal 1 km; penempatan dapat pada website/kanal resmi AHU dan
  diumumkan melalui Instagram AHU. \|

| QR Onsite \| QR khusus onsite untuk pengambilan antrean di lokasi. \|

| Antrean Terlewat \| Jika pemohon terlewat 3 nomor antrean, pemohon
  mengambil nomor baru; disclaimer ditampilkan pada tiket/nomor antrean.
  \|

| Loket Prioritas \| Loket prioritas dapat melayani semua layanan dan
  dapat dipakai antrean umum saat tidak digunakan/ketika antrean padat.
  \|

| Mesin Existing \| Digunakan sebagai second display dan opsi
  walk-in/printing bagi pengguna tanpa HP untuk scan QR. \|

| Server & Domain \| Request detail server, domain, dan PIC
  infrastruktur perlu dikonfirmasi dengan tim AHU. \|

| No. \| Tahapan \| Periode \| Fokus Kegiatan \| Output \|

| --- \| --- \| --- \| --- \| --- \|

| 01 \| Assessment \| 14 September 2026 \| Diskusi kebutuhan, review
  existing system, site survey, identifikasi requirement teknis \|
  Requirement & flow sistem antrean \|

| 02 \| Development \| 15--18 September 2026 \| Pengembangan sistem,
  implementasi fitur utama, setup environment, internal testing \|
  Prototype / sistem siap diuji \|

| 03 \| UAT, Finalisasi & Deployment \| 21--25 September 2026 \| UAT
  bersama AHU, perbaikan hasil UAT, finalisasi, deployment, dan serah
  terima \| Sistem siap digunakan (Go-Live) \|

| Loket \| Layanan \|

| --- \| --- \|

| 1 \| Apostille \|

| 2 \| Apostille \|

| 3 \| Perdata \|

| 4 \| Prioritas & Badan Usaha \|

| 5 \| Badan Usaha \|

| 6 \| Kewarganegaraan \|

| 7 \| Kewarganegaraan \|

| 8 \| Legalasi \|

| 9 \| Semua Layanan \|

| Phase \| Kegiatan \| Output/Ruang Lingkup \| Status \|

| --- \| --- \| --- \| --- \|

| Development \| Design sistem \| Menyusun desain arsitektur, data
  model, alur antrean, role, loket, QR, display, dan reporting. \| On
  Progress \|

| Development \| Development sistem antrean \| Implementasi public
  queue, service/queue type, nomor antrean, status, service date,
  validasi form, dan aturan antrean. \| On Progress \|

| Development \| Development dashboard/operator \| Implementasi
  login/role operator, next, recall, skip, complete, pemanggilan antrean
  tertentu, prioritas, dan history. \| On Progress \|

| Development \| Development display nomor antrean \| Implementasi
  display realtime, nomor sedang dilayani, loket, flag prioritas,
  audio/TTS, serta dukungan display existing/second display. \| On
  Progress \|

| Development \| Development reporting \| Dashboard statistik dan
  laporan detail per layanan, filter tanggal/layanan/operator, kepuasan,
  serta ekspor Excel harian. \| On Progress \|

| Testing \| Internal Testing / SIT \| Pengujian end-to-end internal dan
  System Integration Testing pada skenario layanan AHU. \| \|

| Testing \| Penemuan bug dan Perbaikan hasil testing \| Pencatatan
  defect, perbaikan, regression test, dan verifikasi hasil perbaikan. \|
  \|

| Deployment \| Persiapan deployment \| Persiapan server, database,
  environment variable, domain, SSL/HTTPS, backup, monitoring, dan
  konfigurasi jaringan. \| \|

| Deployment \| Deployment sistem \| Build aplikasi production,
  deployment database/migration, konfigurasi service, dan validasi
  akses. \| \|

| Deployment \| Konfigurasi perangkat / display / jaringan \|
  Konfigurasi TV/display, browser/kiosk bila diperlukan, mesin existing,
  QR, jaringan, dan audio. \| \|

| Go-Live \| Go-Live sistem \| Pengaktifan sistem untuk operasional AHU.
  \| \|

| Go-Live \| Monitoring awal penggunaan sistem \| Monitoring antrean,
  operator, display, performa, error, dan alur pengguna pada periode
  awal. \| \|

| UAT \| Persiapan UAT \| Menyiapkan skenario, akun, data uji,
  perangkat, dan checklist UAT. \| \|

| UAT \| Pelaksanaan UAT dengan AHU \| Pelaksanaan pengujian bersama
  stakeholder AHU berdasarkan skenario yang disepakati. \| \|

| UAT \| Dokumentasi hasil UAT \| Mencatat hasil pengujian, evidence,
  issue, status pass/fail, dan acceptance. \| \|

| UAT \| Perbaikan hasil UAT \| Melakukan perbaikan terhadap temuan UAT
  dan regression test sebelum final acceptance. \| \|

| Modul \| Fungsi \|

| --- \| --- \|

| Public / Visitor \| Public page, pilihan layanan, dynamic form, nomor
  antrean, status antrean, rating/feedback. \|

| Queue Management \| Queue type, prefix/format nomor, service date,
  status. \|

| Operator \| Next, recall, skip, complete, panggil nomor prioritas,
  antrean waiting/skipped, history. \|

| Priority Queue \| Flag prioritas, pemanggilan langsung, pengaturan
  urutan/pelompatan sesuai kebijakan AHU. \|

| Atensi \| QR khusus onsite, antrean internal, tidak ditampilkan pada
  public display. \|

| Display \| Global/queue display, realtime update, current queue,
  loket, audio/TTS, widget/layout, media. \|

| Dashboard \| Total visitor, total queue, completed, waiting, skipped,
  cancelled, waktu tunggu, waktu layanan, satisfaction. \|

| Reporting \| Filter tanggal, layanan, operator/event; statistik per
  layanan; export Excel; laporan harian. \|

| Administration \| User/role, queue type, service/session, operator
  assignment, display, media, configuration. \|

| Skenario \| Kriteria \| Status \|

| --- \| --- \| --- \|

| Registrasi online \| QR online, geotagging ≤ 1 km, form wajib, nomor
  antrean \| Pass/Fail \|

| Registrasi onsite \| QR onsite dan mesin existing \| Pass/Fail \|

| Atensi \| QR Atensi, onsite-only, tidak tampil di public display \|
  Pass/Fail \|

| Prioritas \| Flag, display, pemanggilan langsung, skip \| Pass/Fail \|

| Operator \| Next, recall, skip, complete, call specific queue \|
  Pass/Fail \|

| Display \| Realtime update, loket, audio/TTS, prioritas \| Pass/Fail
  \|

| Antrean terlewat \| Setelah melewati 3 nomor → ambil nomor baru +
  disclaimer \| Pass/Fail \|

| Reporting \| Filter, per layanan, jumlah pemohon, kepuasan, Excel \|
  Pass/Fail \|

| Concurrency \| Dua operator tidak memanggil nomor yang sama \|
  Pass/Fail \|

| Security & access \| Role/permission, session, HTTPS, secret
  configuration \| Pass/Fail \|

| URL Testing \| QR \| Keterangan \|

| --- \| --- \| --- \|

| https://antrean.tegwa.my.id/p/af8p23j8 \| \| Public on the spot \|

| https://antrean.tegwa.my.id/p/galeri-inovasi-ahu \| \| Public online
  \|

| https://antrean.tegwa.my.id/p/khusus-atensi \| \| Atensi \|

| Pengguna \| Email \| Password \| Loket \|

| --- \| --- \| --- \| --- \|

| loket1 \| loket1@ahu.go.id \| loket123! \| loket1 \|

| loket2 \| loket2@ahu.go.id \| loket123! \| loket2 \|

| loket3 \| loket3@ahu.go.id \| loket123! \| loket3 \|

| loket4 \| loket4@ahu.go.id \| loket123! \| loket4 \|

| loket5 \| loket5@ahu.go.id \| loket123! \| loket5 \|

| loket6 \| loket6@ahu.go.id \| loket123! \| loket6 \|

| loket7 \| loket7@ahu.go.id \| loket123! \| loket7 \|

| loket8 \| loket8@ahu.go.id \| loket123! \| loket8 \|

| loket9 \| loket9@ahu.go.id \| loket123! \| loket9 \|

| admin \| admin@ahu.go.id \| admin123! \| admin123! \|

| Deliverable \| Output \|

| --- \| --- \|

| Aplikasi Sistem Antrean AHU Production \| Sistem antrean siap
  digunakan. \|

| Dokumentasi Testing \| SIT, bug list, regression test. \|

| Dokumentasi Deployment \| Konfigurasi environment dan perangkat. \|

| Dokumentasi UAT \| Skenario, hasil, evidence, issue, acceptance. \|

| Dokumentasi Operasional \| Panduan operator/admin dan ketentuan
  antrean. \|

| Pihak \| Nama \| Tanggal \| Tanda Tangan \|

| --- \| --- \| --- \| --- \|

| Tim Pengembang \| \| \| \|

| PIC Ditjen AHU \| \| \| \|

| Perwakilan User/AHU \| \| \| \|
