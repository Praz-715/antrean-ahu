# Panduan Deployment

Dokumen ini menjelaskan cara menjalankan ANTREAN di server sungguhan, bukan di mesin pengembang.

Ringkasnya: satu proses Node, satu database MySQL, satu direktori penyimpanan berkas, di belakang
reverse proxy yang mengurus HTTPS.

---

## 1. Kebutuhan Server

| Komponen | Minimal | Catatan |
|---|---|---|
| Node.js | 22 LTS | Aplikasi berjalan sebagai server Node — **bukan** serverless/edge |
| MySQL | 8.0+ | Butuh `SELECT … FOR UPDATE SKIP LOCKED` dan `CONVERT_TZ` |
| RAM | 1 GB | 2 GB bila banyak layar display terhubung |
| Disk | 5 GB + media | `storage/uploads` tumbuh mengikuti unggahan gambar/video |

**Mengapa harus server Node.** Socket.IO menempel pada proses Nitro yang sama dengan aplikasi
(lihat [WEBSOCKET.md](WEBSOCKET.md)). Platform serverless mematikan proses antar-permintaan,
sehingga koneksi realtime tidak akan bertahan.

**Zona waktu server tidak perlu diubah.** Database menyimpan UTC dan tanggal layanan dihitung pada
zona waktu tiap event. Server boleh berjalan di UTC — justru itu yang disarankan.

---

## 2. Variabel Lingkungan

Salin `.env.example` menjadi `.env`, lalu isi. Yang **wajib** diganti sebelum produksi:

| Variabel | Keterangan |
|---|---|
| `NODE_ENV` | `production` — menyalakan cookie `Secure`, HSTS, dan pesan error yang tidak bocor detail |
| `APP_URL` | URL publik lengkap, mis. `https://antrean.instansi.go.id`. Dipakai untuk QR code & trusted origin |
| `BETTER_AUTH_URL` | Sama dengan `APP_URL` |
| `BETTER_AUTH_SECRET` | Rahasia sesi, minimal 32 karakter acak — `openssl rand -base64 32` |
| `APP_ENCRYPTION_KEY` | Kunci AES-256-GCM untuk kredensial integrasi — `openssl rand -hex 32` |
| `DATABASE_URL` | `mysql://user:sandi@host:3306/antrean` dengan pengguna khusus, bukan `root` |

Yang sebaiknya diperiksa:

| Variabel | Bawaan | Keterangan |
|---|---|---|
| `DEFAULT_TIMEZONE` | `Asia/Jakarta` | Hanya nilai awal; tiap event punya zona waktunya sendiri |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | 20 / 60000 | Batas pengambilan nomor per IP |
| `STORAGE_LOCAL_PATH` | `./storage/uploads` | Arahkan ke volume yang ikut dicadangkan |
| `MEDIA_MAX_IMAGE_MB` / `MEDIA_MAX_VIDEO_MB` | 10 / 200 | Batas ukuran unggahan |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | kosong | Isi bila halaman publik ingin memakai captcha |
| `DATA_SOURCE_ALLOW_PRIVATE` | `false` | **Biarkan false.** `true` memperbolehkan integrasi menghubungi alamat internal |
| `DATA_SOURCE_HOST_ALLOWLIST` | kosong | Isi (dipisah koma) untuk mengunci integrasi ke host tertentu |
| `SCHEDULER_ENABLED` | `true` | Isi `false` pada instance tambahan bila menjalankan lebih dari satu proses |

> **Kunci enkripsi tidak boleh berganti begitu saja.** Kredensial integrasi yang sudah tersimpan
> hanya bisa dibaca dengan kunci yang menuliskannya. Bila `APP_ENCRYPTION_KEY` diganti, seluruh
> kredensial sumber data harus dimasukkan ulang.

---

## 3. Menyiapkan Database

```bash
# 1. Buat database dan pengguna khusus
mysql -u root -p <<'SQL'
CREATE DATABASE antrean CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'antrean'@'%' IDENTIFIED BY 'ganti-dengan-sandi-kuat';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON antrean.* TO 'antrean'@'%';
FLUSH PRIVILEGES;
SQL

# 2. Terapkan migrasi (JANGAN pakai db:migrate di produksi)
npm run db:deploy
```

`db:deploy` hanya menerapkan migrasi yang sudah ada. `db:migrate` boleh membuat migrasi baru dan
berpotensi meminta reset — itu perkakas pengembangan.

---

## 4. Data Awal

Ada dua pilihan seed:

```bash
npm run db:seed         # data contoh lengkap: event demo, layanan, operator, display
npm run db:seed:prod    # minimal: permission, role sistem, satu organisasi, satu superadmin
```

Untuk instalasi baru gunakan **`db:seed:prod`**. Ia mencetak kata sandi awal sekali di terminal
dan tidak menyimpannya di mana pun.

### Checklist setelah seed produksi

- [ ] Login sebagai superadmin, lalu **ganti kata sandi** lewat menu profil.
- [ ] Ganti alamat email superadmin ke email yang benar-benar dipantau.
- [ ] Buat pengguna admin harian; jangan memakai superadmin untuk pekerjaan sehari-hari.
- [ ] Buka **Pengaturan Sistem**, sesuaikan zona waktu, batas panggil ulang, dan durasi sesi.
- [ ] Buat event, jenis antrean, loket, lalu jadwalkan jam layanan.
- [ ] Terbitkan halaman publik dan cetak QR-nya.
- [ ] Pasangkan perangkat display satu per satu (pairing hanya bisa sekali per perangkat).
- [ ] Periksa **Audit Log** memuat aktivitas Anda — bukti pencatatan berjalan.

---

## 5. Build & Jalankan

```bash
npm ci
npm run build
node .output/server/index.mjs
```

Layanan systemd:

```ini
# /etc/systemd/system/antrean.service
[Unit]
Description=ANTREAN Queue Management System
After=network.target mysql.service

[Service]
Type=simple
User=antrean
WorkingDirectory=/opt/antrean
EnvironmentFile=/opt/antrean/.env
ExecStart=/usr/bin/node .output/server/index.mjs
Restart=always
RestartSec=5
# Berkas unggahan berada di luar .output, jadi direktorinya harus tetap bisa ditulis
ReadWritePaths=/opt/antrean/storage

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now antrean
sudo systemctl status antrean
```

---

## 6. Reverse Proxy

WebSocket harus diteruskan, dan alamat asli pengunjung harus ikut — rate limit serta jejak audit
membacanya dari `X-Forwarded-For`.

```nginx
server {
    listen 443 ssl http2;
    server_name antrean.instansi.go.id;

    ssl_certificate     /etc/letsencrypt/live/antrean.instansi.go.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/antrean.instansi.go.id/privkey.pem;

    # Video display bisa besar
    client_max_body_size 220M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Wajib untuk Socket.IO
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Layar display menahan koneksi lama; jangan diputus proxy
        proxy_read_timeout 3600s;
    }
}
```

Aplikasi sudah memasang header keamanannya sendiri (CSP, `X-Frame-Options`, `Referrer-Policy`,
HSTS saat produksi) di `server/middleware/security-headers.ts` — tidak perlu diduplikasi di nginx,
karena dua sumber header yang berbeda justru sulit ditelusuri saat bermasalah.

---

## 7. Docker (alternatif)

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output ./.output
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
VOLUME ["/app/storage"]
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

Jalankan migrasi sebagai langkah terpisah sebelum kontainer aplikasi naik, bukan di dalam `CMD` —
dua kontainer yang start bersamaan tidak boleh bermigrasi berbarengan.

---

## 8. Menjalankan Lebih dari Satu Instance

Dua hal berstatus in-memory dan harus diperhatikan saat scale-out:

1. **Socket.IO.** Tanpa adapter bersama, pesan hanya sampai ke klien yang terhubung ke instance
   yang sama. Pasang `@socket.io/redis-adapter` di `server/plugins/socket.ts`.
2. **Penjadwal buka/tutup.** Berjalan di dalam proses. Nyalakan hanya pada satu instance;
   sisanya diberi `SCHEDULER_ENABLED=false`.

Rate limit juga in-memory (`server/utils/rate-limit.ts`); dengan N instance, batas efektifnya
menjadi N kali lipat. Pindahkan penyimpanannya ke Redis bila itu penting.

---

## 9. Cadangan

| Yang dicadangkan | Cara |
|---|---|
| Database | `mysqldump --single-transaction --routines antrean` |
| Berkas media | Arsipkan direktori `storage/uploads` |
| Konfigurasi | `.env` (simpan terpisah, berisi rahasia) |

Pulihkan dengan urutan: database → media → jalankan `npm run db:deploy` untuk memastikan skema
sudah setara dengan versi aplikasi.

---

## 10. Pemeriksaan Setelah Deploy

```bash
curl -fsS https://antrean.instansi.go.id/api/health          # {"success":true,...}
curl -sI https://antrean.instansi.go.id/api/health | grep -i strict-transport   # HSTS aktif
```

Lalu di peramban:

- Buka halaman publik, ambil satu nomor, pastikan halaman pelacakan hidup tanpa reload.
- Buka layar display, pasangkan, lalu panggil satu nomor dari dashboard operator —
  nomor harus muncul dan terbacakan dalam hitungan detik.
- Buka **Audit Log**; aktivitas barusan harus tercatat.

Uji beban ringan bisa dijalankan terhadap instalasi non-produksi:

```bash
QUEUES=2000 DISPLAYS=200 npm run load-test
```

---

## 11. Pemeliharaan Rutin

| Berkala | Tindakan |
|---|---|
| Harian | Pantau ukuran `storage/uploads` dan log aplikasi |
| Mingguan | Periksa Audit Log untuk aktivitas yang tidak dikenali |
| Bulanan | Tinjau daftar pengguna & role; nonaktifkan yang sudah tidak bertugas |
| Saat upgrade | `npm ci && npm run db:deploy && npm run build`, lalu restart layanan |

Tabel yang tumbuh paling cepat: `queues`, `queue_events`, `audit_logs`, dan `notifications`.
Simpan kebijakan retensi sesuai kebutuhan instansi — belum ada penghapusan otomatis di aplikasi,
dan itu disengaja: data antrean sering dibutuhkan untuk laporan tahunan.
