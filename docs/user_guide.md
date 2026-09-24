# PANDUAN PENGGUNA
## Sistem Antrean Digital — ANTREAN AHU

**Untuk:** Petugas loket, administrator, dan pengelola layanan Ditjen AHU
**Versi dokumen:** 23 September 2026

---

## Daftar Isi

1. [Siapa memakai bagian yang mana](#1-siapa-memakai-bagian-yang-mana)
2. [Panduan Pengunjung](#2-panduan-pengunjung)
3. [Panduan Petugas Loket (Operator)](#3-panduan-petugas-loket-operator)
4. [Panduan Layar Antrean (Display)](#4-panduan-layar-antrean-display)
5. [Panduan Administrator](#5-panduan-administrator)
6. [Rutinitas Harian](#6-rutinitas-harian)
7. [Pemecahan Masalah](#7-pemecahan-masalah)
8. [Istilah](#8-istilah)

---

## 1. Siapa memakai bagian yang mana

| Peran | Yang dibuka | Isi panduannya |
|---|---|---|
| Pengunjung/pemohon | Halaman publik dari QR, lalu halaman tiket | Bagian 2 |
| Petugas loket | `/operator` | Bagian 3 |
| Layar TV di ruang tunggu | `/display/<kode-perangkat>` | Bagian 4 |
| Administrator | `/admin` | Bagian 5 |

Seluruh peran memakai satu alamat yang sama; yang membedakan hanyalah akun dan izinnya.

---

## 2. Panduan Pengunjung

Bagian ini dapat dijadikan bahan sosialisasi atau papan informasi di lokasi.

### 2.1 Mengambil nomor antrean

1. **Pindai QR** yang tersedia — QR onsite di lokasi layanan, atau QR online dari kanal resmi AHU.
2. Halaman layanan terbuka. **Pilih layanan** yang dibutuhkan, misalnya Apostille atau Badan Usaha.
3. **Isi formulir**: Nama, Email, Nomor HP, dan Keperluan. Keempatnya wajib diisi. Isian yang
   sudah benar ditandai centang; isian yang masih kosong diberi peringatan sebelum nomor dapat
   diambil.
4. **Selesaikan verifikasi keamanan** (geser potongan gambar sampai pas). Verifikasi baru muncul
   setelah formulirnya lengkap.
5. **Nomor antrean terbit** dan halaman tiket langsung terbuka.

> **Antrean online** dapat dibatasi berdasarkan lokasi. Bila pagar lokasi diaktifkan, pengambilan
> nomor hanya berhasil dari radius yang ditentukan (1 km dari lokasi layanan), dan peramban akan
> meminta izin akses lokasi.

> **Antrean Atensi** memakai QR tersendiri dan hanya dilayani di lokasi. Nomor Atensi tidak
> ditampilkan pada layar antrean publik.

### 2.2 Memantau nomor

Halaman tiket menampilkan:

- Nomor antrean dan nama layanan.
- **Status**: Menunggu, Dipanggil, Dilayani, Dilewati, Selesai, atau Hangus.
- **Jumlah orang di depan** dan perkiraan waktu tunggu.
- **Nomor yang sedang dilayani** beserta loketnya.
- Tanggal layanan dan waktu pengambilan nomor.

Halaman ini memperbarui dirinya sendiri. Simpan tautannya agar dapat dibuka kembali; tombol
**Cetak** tersedia bila tiket ingin dicetak.

Saat nomor dipanggil, halaman berbunyi dan bergetar. Izinkan notifikasi peramban bila ingin
mendapat pemberitahuan meski halaman sedang tidak dibuka.

### 2.3 Aturan nomor hangus

Nomor akan **hangus** bila petugas sudah memanggil **3 nomor** sesudah nomor tersebut. Sisa
tenggang ditampilkan pada tiket, misalnya *"Saat ini tersisa 2 nomor lagi sebelum nomor Anda
hangus."*

Bila nomor sudah hangus, tiket menampilkan pemberitahuan beserta tombol **Ambil nomor baru**.
Nomor lama tidak dapat dipanggil kembali.

> Angka 3 mengikuti pengaturan sistem dan dapat diubah administrator.

### 2.4 Memberi penilaian

Setelah layanan selesai, halaman tiket menampilkan penilaian bintang 1–5 beserta kolom komentar
opsional. Hasilnya masuk ke laporan kepuasan layanan. Penilaian hanya muncul bila fitur ini
diaktifkan administrator.

---

## 3. Panduan Petugas Loket (Operator)

### 3.1 Masuk

1. Buka `/login`.
2. Masukkan email dan sandi loket. Ikon mata di kolom sandi dapat dipakai untuk memeriksa ketikan.
3. Selesaikan verifikasi geser.
4. Setelah masuk, buka `/operator`.

Bila muncul pesan **"Belum ada penugasan"**, artinya akun tersebut belum ditempatkan pada loket.
Hubungi administrator.

### 3.2 Mengenali papan kerja

| Bagian | Isi |
|---|---|
| Tab layanan di atas | Layanan yang dilayani loket Anda; klik untuk berpindah |
| Panel tengah | Nomor yang sedang dilayani, nama pemohon, penanda prioritas, waktu panggil |
| Tombol aksi | Panggil Ulang, Lewati, Selesai, Panggil Berikutnya, Tidak Hadir, Batalkan |
| Statistik | Menunggu, Selesai, Dilewati, Total hari ini |
| **Menunggu** | Daftar nomor berikutnya beserta nama pemohon |
| **Dilewati** | Nomor yang tadi dilewati dan masih dapat dipanggil kembali |
| **Riwayat** | Nomor yang sudah selesai, dibatalkan, tidak hadir, atau hangus |

### 3.3 Alur melayani satu pemohon

1. **Panggil Berikutnya** — sistem mengambil nomor teratas (prioritas didahulukan), menampilkannya
   di layar antrean, dan membunyikan panggilan suara.
2. Bila pemohon belum datang, tekan **Panggil Ulang**.
3. Saat pemohon tiba, tekan **Mulai Layani** agar waktu layanan mulai dihitung.
4. Setelah selesai, tekan **Selesai**.

Menekan **Panggil Berikutnya** juga otomatis menutup nomor yang sedang Anda layani sebagai
Selesai, sehingga alur normal cukup satu tombol.

### 3.4 Tombol lain

| Tombol | Kapan dipakai | Akibatnya |
|---|---|---|
| **Lewati** | Pemohon tidak hadir saat dipanggil | Nomor masuk daftar Dilewati dan masih bisa dipanggil kembali |
| **Tidak Hadir** | Dipastikan pemohon tidak datang | Nomor ditutup sebagai Tidak Hadir |
| **Batalkan** | Nomor perlu dibatalkan | Meminta alasan; nomor ditutup dan tercatat di audit |
| **Panggil** (di daftar Dilewati) | Pemohon yang tadi terlewat kembali ke loket | Nomor dipanggil ulang |
| **Ikon prioritas** (di daftar Menunggu) | Lansia, disabilitas, ibu hamil, atau kondisi mendesak | Nomor tersebut dipanggil langsung dan ditandai prioritas |

> **Tidak ada tombol "panggil nomor ini" pada daftar Menunggu.** Urutan panggilan datang dari
> tombol Panggil Berikutnya. Memanggil nomor di tengah daftar akan melompati orang-orang di
> depannya — dan sejak aturan nomor hangus berlaku, lompatan itu dapat menghanguskan nomor mereka.
> Satu-satunya cara mendahulukan seseorang adalah tombol prioritas.

### 3.5 Pintasan papan ketik

| Tombol | Fungsi |
|---|---|
| `N` | Panggil berikutnya |
| `R` | Panggil ulang |
| `M` | Mulai layani |
| `S` | Lewati |
| `C` | Selesai |

### 3.6 Yang perlu diperhatikan

- **Dua loket tidak akan mendapat nomor yang sama** meski menekan tombol bersamaan.
- Nomor yang sudah **hangus** tidak muncul lagi di daftar Menunggu maupun Dilewati, dan tidak
  dapat dipanggil. Pemohonnya harus mengambil nomor baru.
- Indikator **Terhubung** di pojok kanan atas menandakan papan menerima pembaruan seketika. Bila
  berubah menjadi terputus, papan tetap bekerja dengan pembaruan berkala.

---

## 4. Panduan Layar Antrean (Display)

### 4.1 Memasang layar

1. Administrator membuat perangkat display di menu **Display → Perangkat Display** dan menyalin
   tautannya.
2. Buka tautan `/display/<kode-perangkat>` pada peramban perangkat layar.
3. **Pairing terjadi otomatis** pada kunjungan pertama. Perangkat itu kemudian terikat pada
   peramban tersebut.
4. Jalankan peramban dalam mode layar penuh (`F11`).

Bila layar perlu dipindah ke perangkat lain, administrator menekan **Reset Pairing** pada menu
Perangkat Display, lalu tautannya dibuka di perangkat baru.

### 4.2 Yang tampil di layar

- Kepala layar dengan logo dan nama instansi, jam, tanggal, serta status layanan.
- Kartu tiap layanan: lambang layanan, nama, nomor yang sedang dilayani, loket tujuan, dan jumlah
  antrean menunggu.
- Penanda **PRIORITAS** pada nomor prioritas.
- Bilah status bawah yang **menghilang sendiri setelah 5 detik** agar layar benar-benar penuh;
  bilah muncul kembali saat kursor digerakkan atau layar disentuh.

### 4.3 Suara panggilan

Suara aktif otomatis saat halaman dibuka. Bila peramban memblokir pemutaran otomatis, muncul
tombol **"Suara Diblokir — Ketuk"**; satu ketukan pada layar akan mengaktifkannya. Ini batasan
peramban, bukan kesalahan sistem.

Layar hanya menyuarakan panggilan untuk layanan yang ditampilkan pada layar tersebut.

### 4.4 Layar khusus

Satu perangkat dapat disetel untuk:

| Tipe | Kegunaan |
|---|---|
| **Global — semua layanan** | Layar utama ruang tunggu |
| **Khusus satu layanan** | Layar di depan loket tertentu |
| **Beberapa layanan — pilih & urutkan** | Layar yang hanya menampilkan sebagian layanan pada urutan yang ditentukan |

Layar publik Ditjen AHU memakai tipe ketiga agar **nomor Atensi tidak ikut tampil**.

---

## 5. Panduan Administrator

Masuk melalui `/login`, lalu buka `/admin`. Menu yang terlihat mengikuti izin akun.

### 5.1 Dashboard

Ringkasan hari berjalan: total antrean, menunggu, sedang dilayani, selesai, dilewati, dibatalkan,
rata-rata waktu tunggu dan waktu layanan, tingkat kepuasan, serta grafik volume per jam.

Jumlah nomor **Hangus** ditampilkan pada menu **Laporan**, bukan pada dashboard.

### 5.2 Antrean

| Menu | Fungsi |
|---|---|
| **Antrean Live** | Memantau seluruh antrean berjalan lintas loket |
| **Jenis Antrean** | Mengelola layanan: kode, nama, prefix, format nomor, nomor awal, jumlah digit, estimasi layanan, batas antrean menunggu, warna, dan logo layanan |
| **Loket** | Mengelola loket dan layanan yang dilayaninya |
| **Riwayat Antrean** | Menelusuri antrean hari-hari sebelumnya |

**Menambah layanan baru:** Jenis Antrean → *Tambah Jenis Antrean* → isi Kode (mis. `AP`), Nama,
Prefix, dan format nomor. Pratinjau nomor tampil langsung di formulir.

**Logo layanan** dipilih dari Media Library dan dipakai pada kartu layanan halaman publik serta
papan layar antrean. Layanan tanpa logo menampilkan huruf kodenya.

> Jenis antrean **tidak dapat dihapus** selama masih dipakai loket. Lepaskan dulu dari loketnya —
> pesan galat akan menyebut loket mana saja.

### 5.3 Event / Sesi

Event adalah wadah satu penyelenggaraan layanan: jam operasional per hari, zona waktu, branding,
dan status (Buka, Jeda, Tutup). Mengubah status di sini memengaruhi seluruh kanal sekaligus —
pengambilan nomor baru mengikuti jam layanan dan status event.

Angka pada kartu event — **layanan**, **loket**, dan **antrean hari ini** — menghitung antrean pada
tanggal layanan berjalan, bukan sepanjang riwayat. Total sepanjang masa ada di halaman detail
event sebagai *Total antrean* dan *Total pengunjung*.

Event hanya dapat dihapus bila **tidak ada antrean aktif hari ini**. Nomor yang tertinggal
menunggu dari hari-hari sebelumnya tidak menahan penghapusan, dan riwayat antreannya tetap
tersimpan setelah event disembunyikan.

### 5.4 Pengunjung

| Menu | Fungsi |
|---|---|
| **Daftar Pengunjung** | Data pemohon beserta riwayat antreannya |
| **Rating & Testimoni** | Penilaian pengunjung; dapat disetujui atau disembunyikan |

### 5.5 Operator

| Menu | Fungsi |
|---|---|
| **Pengguna** | Membuat dan menonaktifkan akun |
| **Role & Izin** | Menyusun izin tiap role (Superadmin, Admin, Operator, Viewer) |
| **Penempatan Operator** | Mendudukkan operator pada satu loket |

Satu operator duduk di **satu loket**, dan loket itulah yang menentukan layanan yang boleh ia
tangani. Email akun yang sudah dihapus dapat dipakai lagi untuk akun baru.

### 5.6 Publikasi

| Menu | Fungsi |
|---|---|
| **Halaman Publik** | Halaman pengambilan nomor beserta QR-nya |
| **Form Builder** | Menyusun isian formulir: jenis field, wajib/tidak, panjang minimum, dan aturan lain |

Tiap kartu halaman publik memuat:

- **Susun Tampilan** — builder halaman: judul, hero, layanan yang ditampilkan, informasi, lokasi,
  footer, warna, logo, dan penanda kartu layanan.
- **QR** — menu dengan dua pilihan:
  - **QR dinamis (kode publikasi)** — dapat dicabut kapan saja lewat *Ganti tautan & QR*; cocok
    untuk sebaran yang perlu bisa dimatikan.
  - **QR statis (tautan slug)** — tetap selama slug tidak diubah; cocok untuk papan akrilik,
    spanduk, dan brosur yang mahal dicetak ulang.
  Keduanya dapat diunduh sebagai PNG atau SVG, atau langsung dicetak.
- **Publikasikan / Hentikan** — mengatur apakah halaman dapat diakses pengunjung.
- **Menu titik tiga** — *Perbarui QR* (versi baru, tautan tetap) dan *Ganti tautan & QR* (kode
  publikasi diganti; seluruh QR dinamis lama berhenti berlaku).

Pengaturan penting lain pada builder: **kuota per IP per hari**, **captcha**, dan **pagar lokasi**
(titik koordinat dan radius).

### 5.7 Display

| Menu | Fungsi |
|---|---|
| **Perangkat Display** | Mendaftarkan layar, memilih tipe dan tata letak, memilih data pengunjung yang tampil, reset pairing |
| **Pengumuman** | Teks berjalan pada layar antrean |
| **Display Builder** | Menyusun tata letak layar: widget nomor, loket, jam, logo, gambar, video, playlist, teks berjalan, dan QR Code |
| **Media Library** | Gambar, video, dan audio untuk layar serta logo layanan |

Pada widget **QR Code** tersedia pilihan **Halaman Publik** (halaman mana yang di-QR-kan) dan
**Bentuk QR** (dinamis atau statis).

Layar yang memakai **Tata letak bawaan sistem** punya satu pilihan tambahan di kartunya: **data
pengunjung** yang ditampilkan di bawah nomor. Pilih salah satu isian Form Builder — misalnya
*Keperluan* — dan kartu layanan menampilkan isian itu milik nomor yang sedang dipanggil. Bila
dibiarkan pada *"— jumlah menunggu & berikutnya —"*, kartu menampilkan ringkasan antrean seperti
biasa. Hanya satu isian yang bisa dipilih agar tetap terbaca dari seberang ruangan. Layar yang
memakai tata letak dari Display Builder mengatur hal ini lewat widget **Data Pengunjung**, jadi
pilihan ini tidak muncul di kartunya.

> Berkas media **tidak dapat dihapus** selama masih dipakai. Kartu media menyebutkan tempat
> pemakaiannya, misalnya *Widget display "gedung 5"* atau *Logo jenis antrean "Apostille"*.

### 5.8 Sistem

| Menu | Fungsi |
|---|---|
| **Laporan** | Laporan harian siap cetak dan Pusat Ekspor |
| **Pengaturan** | Pengaturan sistem, dikelompokkan menjadi Antrean, Rating & Testimoni, Display & Suara, Tampilan Loading, dan Sistem |
| **Audit Log** | Catatan siapa melakukan apa dan kapan |
| **Integrasi** | Sumber data eksternal untuk pengisian otomatis formulir |

**Laporan harian**: pilih tanggal, lalu *Cetak / Simpan PDF*.

**Pusat Ekspor**: pilih data (Riwayat Antrean, Daftar Pengunjung, Performa Operator, Rating &
Testimoni), format (**Excel .xlsx** atau **CSV**), rentang tanggal, dan — bila perlu — saring
menurut jenis antrean (boleh lebih dari satu). Ekspor diproses di latar belakang; berkasnya dapat
diunduh setelah statusnya selesai.

**Pengaturan yang paling sering disesuaikan:**

| Pengaturan | Arti |
|---|---|
| Nomor hangus setelah terlewat | Ambang batas aturan nomor hangus; `0` mematikan aturan |
| Batas panggil ulang | Berapa kali satu nomor boleh dipanggil ulang |
| Reset nomor tiap hari | Penomoran kembali ke awal setiap tanggal layanan baru |
| Tutup otomatis di luar jam layanan | Menolak nomor baru di luar jam operasional |
| Maksimum antrean menunggu | Batas panjang antrean |
| Minta rating setelah dilayani | Menyalakan penilaian pada tiket pengunjung |
| Panggilan suara di display, bahasa, sumber suara, nada panggil | Perilaku suara layar antrean |
| Durasi sesi login | Berapa lama sesi bertahan sebelum harus masuk ulang |

---

## 6. Rutinitas Harian

### Sebelum layanan dibuka

1. Pastikan status event **Buka** (menu Event / Sesi).
2. Nyalakan layar antrean dan pastikan indikatornya terhubung; ketuk sekali bila suara diblokir.
3. Pastikan tiap operator sudah masuk dan melihat loketnya di `/operator`.
4. Periksa QR di lokasi masih terbaca dan mengarah ke halaman yang benar.

### Selama layanan

- Pantau **Antrean Live** dan dashboard untuk melihat antrean yang menumpuk.
- Gunakan tombol prioritas untuk pemohon lansia, disabilitas, atau ibu hamil.
- Pemohon yang nomornya hangus diarahkan mengambil nomor baru.

### Setelah layanan ditutup

1. Ubah status event menjadi **Tutup**.
2. Buka menu **Laporan**, cetak laporan harian bila diperlukan.
3. Jalankan ekspor harian ke Excel bila dibutuhkan untuk pelaporan.

---

## 7. Pemecahan Masalah

| Gejala | Kemungkinan sebab | Tindakan |
|---|---|---|
| Layar antrean menampilkan "Perlu pairing ulang" | Perangkat diganti atau data peramban dibersihkan | Reset pairing di Perangkat Display, buka ulang tautannya di layar |
| Suara panggilan tidak berbunyi | Peramban memblokir pemutaran otomatis | Ketuk tombol "Suara Diblokir — Ketuk" pada layar |
| Operator melihat "Belum ada penugasan" | Akun belum ditempatkan di loket | Tempatkan lewat menu Penempatan Operator |
| Pengunjung gagal mengambil nomor: "Perangkat ini sudah mengambil N antrean hari ini" | Kuota per IP per hari tercapai | Naikkan kuota pada builder halaman publik bila memang diperlukan |
| Pengunjung gagal mengambil nomor karena lokasi | Pagar lokasi aktif dan pengunjung di luar radius | Pastikan izin lokasi diizinkan, atau ambil nomor di lokasi |
| Nomor pengunjung hilang dari daftar operator | Nomor sudah hangus karena terlewat | Pemohon mengambil nomor baru |
| Jenis antrean tidak bisa dihapus | Masih dipakai loket | Lepaskan dari loket yang disebut pesan galat |
| Event atau jenis antrean tidak bisa dihapus: "Masih ada N antrean aktif" | Ada nomor **hari ini** yang masih menunggu, dipanggil, atau dilayani | Selesaikan atau batalkan nomor tersebut di menu Antrean Live, lalu ulangi penghapusan |
| Berkas media tidak bisa dihapus | Masih dipakai widget, playlist, logo layanan, atau halaman | Lepaskan dari tempat yang disebut pada kartu media |
| QR lama tidak berfungsi | Kode publikasi diganti lewat *Ganti tautan & QR* | Cetak ulang QR, atau pakai QR statis untuk cetakan permanen |
| Laporan kosong pada tanggal tertentu | Tanggal layanan berbeda dengan tanggal kalender server | Periksa zona waktu event |

---

## 8. Istilah

| Istilah | Arti |
|---|---|
| **Event / Sesi** | Wadah satu penyelenggaraan layanan: jadwal, zona waktu, dan layanannya |
| **Jenis antrean / layanan** | Satu jenis layanan dengan penomorannya sendiri, mis. Apostille (AP) |
| **Loket** | Meja pelayanan; menentukan layanan yang boleh ditangani operator yang duduk di sana |
| **Tanggal layanan** | Tanggal penomoran antrean, dihitung pada zona waktu event |
| **Prioritas** | Penanda antrean yang didahulukan: lansia, disabilitas, ibu hamil |
| **Atensi** | Layanan khusus yang hanya dilayani di lokasi dan tidak ditampilkan pada layar publik |
| **Hangus** | Status nomor yang sudah dilewati sejumlah panggilan dan tidak berlaku lagi |
| **QR dinamis** | QR dari kode publikasi; dapat dicabut dengan mengganti kodenya |
| **QR statis** | QR dari tautan slug; tetap selama slug tidak diubah |
| **Pairing** | Pengikatan satu perangkat layar ke satu tautan display |
| **Pusat Ekspor** | Fitur pembuatan berkas Excel/CSV yang diproses di latar belakang |
