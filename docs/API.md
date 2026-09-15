# API ANTREAN

Seluruh endpoint berada di bawah `/api`. Kecuali endpoint QR (yang mengembalikan berkas gambar),
semua respons memakai amplop yang sama.

## Format Respons

**Berhasil**

```json
{ "success": true, "message": "Antrean A001 dipanggil", "data": { } }
```

**Gagal**

```json
{
  "success": false,
  "message": "Antrean sudah dipanggil operator lain",
  "code": "QUEUE_ALREADY_CALLED",
  "data": null
}
```

**Gagal validasi** menambahkan rincian per-field:

```json
{
  "success": false,
  "message": "Data yang dikirim tidak valid",
  "code": "VALIDATION_ERROR",
  "data": null,
  "errors": { "phone": ["Nomor HP tidak valid"] }
}
```

### Kode Error

| Kode | HTTP | Arti |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Input tidak lolos validasi |
| `UNAUTHENTICATED` | 401 | Belum login |
| `FORBIDDEN` | 403 | Tidak punya izin / bukan assignment-nya |
| `NOT_FOUND` | 404 | Data tidak ditemukan |
| `CONFLICT` | 409 | Bentrok status/data |
| `RATE_LIMITED` | 429 | Terlalu banyak permintaan |
| `EVENT_NOT_OPEN` / `EVENT_PAUSED` / `OUTSIDE_SERVICE_HOURS` | 400 | Event tidak menerima antrean baru |
| `PAGE_NOT_PUBLISHED` | 400 | Halaman publik tidak aktif |
| `QUEUE_TYPE_UNAVAILABLE` | 400 | Layanan tidak tersedia di halaman itu |
| `DAILY_LIMIT_REACHED` | 400 | Batas ambil per IP per hari tercapai |
| `QUEUE_LIMIT_REACHED` | 409 | Kuota antrean menunggu penuh |
| `QUEUE_EMPTY` | 400 | Tidak ada antrean menunggu |
| `QUEUE_ALREADY_CALLED` | 409 | Sudah ditangani operator lain |
| `QUEUE_INVALID_TRANSITION` | 409 | Perubahan status tidak diizinkan |
| `RECALL_LIMIT_REACHED` | 409 | Batas panggil ulang tercapai |
| `ACCOUNT_INACTIVE` | 400 | Akun dinonaktifkan |
| `REGISTRATION_DISABLED` | 400 | Pendaftaran mandiri dimatikan dari pengaturan sistem |
| `RATING_DISABLED` | 400 | Fitur penilaian sedang dimatikan |
| `DATA_SOURCE_UNREACHABLE` | 400 | Sumber data eksternal tidak dapat dihubungi |
| `DATA_SOURCE_INVALID_RESPONSE` | 400 | Respons sumber data bukan JSON yang valid |
| `DATA_SOURCE_DISABLED` | 400 | Integrasi tidak aktif / formulir tidak terhubung |
| `AUTOFILL_NOT_FOUND` | 400 | Data yang dicari tidak ditemukan di sistem eksternal |
| `CAPTCHA_REQUIRED` | 400 | Verifikasi anti-bot belum diselesaikan |
| `CAPTCHA_INVALID` | 400 | Tiket captcha salah, kedaluwarsa, atau sudah dipakai |
| `OUTSIDE_GEOFENCE` | 400 | Pengunjung di luar radius pagar lokasi halaman |

---

## Autentikasi

Ditangani Better Auth pada `/api/auth/*`, memakai cookie sesi httpOnly.

```http
POST /api/auth/sign-in/email
Content-Type: application/json

{ "email": "operator1@antrean.local", "password": "password123" }
```

| Endpoint | Fungsi |
|---|---|
| `POST /api/auth/sign-in/email` | Masuk — wajib header `x-captcha-token` (lihat Captcha Geser) |
| `POST /api/auth/sign-out` | Keluar |
| `GET /api/auth/get-session` | Sesi mentah Better Auth |
| `GET /api/me` | Profil + role + permission + assignment (dipakai UI) |

`GET /api/me` mengembalikan:

```json
{
  "user": { "id": "01M1…", "name": "Operator Satu", "email": "operator1@antrean.local" },
  "organization": { "id": "01M1…", "name": "Demo Organization", "timezone": "Asia/Jakarta" },
  "roles": ["OPERATOR"],
  "isSuperadmin": false,
  "permissions": ["queue.view", "queue.call", "queue.recall", "queue.skip", "queue.complete"],
  "assignments": [{ "queueType": { "code": "A", "name": "Pelayanan Umum" }, "counter": { "name": "Loket 1" } }]
}
```

> Role `SUPERADMIN` mengembalikan `permissions: []` karena ia melewati seluruh pemeriksaan izin
> (`isSuperadmin: true`). Klien wajib memeriksa flag tersebut, bukan hanya daftar permission.

---

## Captcha Geser (tanpa login)

Verifikasi anti-bot bawaan sistem — tidak memakai layanan luar. Dipakai halaman masuk (selalu) dan
pengambilan nomor antrean (bila formulir aktif menyalakannya di `/admin/forms`).

Alurnya tiga langkah: minta teka-teki → kirim posisi potongan → pakai tiket yang terbit.

### `GET /api/captcha/slider?purpose=login|queue`

Rate limit 40 permintaan/menit per IP.

```json
{
  "id": "GSdn0SJCGjv38QOnl9jnaA",
  "background": "data:image/png;base64,…",
  "piece": "data:image/png;base64,…",
  "pieceY": 42,
  "width": 280,
  "height": 170,
  "pieceSize": 52
}
```

Posisi mendatar lubang TIDAK ada dalam respons — hanya ada di server.

### `POST /api/captcha/slider`

Kirim posisi kiri potongan saat dilepas. Rate limit 30 permintaan/menit per IP; tiap teka-teki
hanya menerima 4 percobaan, setelah itu harus meminta teka-teki baru.

```json
{ "id": "GSdn0SJCGjv38QOnl9jnaA", "x": 183, "durationMs": 640, "moves": 14, "purpose": "login" }
```

Respons berisi tiket sekali pakai, berumur 5 menit, terikat pada alamat IP dan `purpose`:

```json
{ "token": "P6iY5agE0du4…" }
```

Gagal menjawab mengembalikan `400` `CAPTCHA_INVALID`; geseran yang terlalu cepat atau tanpa
gerakan menengah ditolak walau posisinya tepat.

### Memakai tiket

| Keperluan | Cara mengirim |
|---|---|
| `login` | Header `x-captcha-token` pada `POST /api/auth/sign-in/email` |
| `queue` | Field `sliderToken` pada `POST /api/public/{publishCode}/queue` |

Tanpa tiket: `400` `CAPTCHA_REQUIRED`. Tiket yang sudah dipakai, kedaluwarsa, milik alamat IP
lain, atau dari `purpose` berbeda: `400` `CAPTCHA_INVALID`.

> `GET /api/captcha/answer?id=…` membuka posisi jawaban untuk uji otomatis. Hanya hidup bila
> `CAPTCHA_DEV_BYPASS=1` dan `NODE_ENV` bukan `production`; selain itu menjawab `404`.

---

## Publik (tanpa login)

### `GET /api/public/landing`

Isi halaman pangkal (`/`) menurut pengaturan `system.landing`. Mengembalikan KEPUTUSAN, bukan
pengaturan mentah — klien cukup mengikuti `redirect` atau menggambar `pages`.

```jsonc
{
  "mode": "none",        // none | directory | event
  "redirect": null,      // terisi "/p/{publishCode}" hanya pada mode "event"
  "organization": { "id": "01M1…", "name": "Demo Organization", "logoUrl": null },
  "pages": []            // terisi pada mode "directory": kartu halaman publik yang terbit
}
```

Tiap entri `pages` membawa `publishCode`, `title`, `subtitle`, `logoUrl`, `backgroundUrl`,
`primaryColor`, `eventName`, dan status buka hari ini (`isOpen`, `openTime`, `closeTime`).
Maksimal 24 halaman. Bila event yang dipilih tidak lagi punya halaman terbit, jawabannya kembali
ke `none` — pengunjung tidak pernah dialihkan ke halaman yang sengaja ditutup.

> **`{publishCode}` menerima dua bentuk.** Kode publikasi (`w8j4hz76`) — yang tercetak di QR dan
> bisa diganti kapan saja — maupun slug halaman (`layanan-ahu-kuningan-city`) yang tetap. Keduanya
> membuka halaman yang sama dan berlaku pada seluruh endpoint publik di bawah ini. Bila sebuah slug
> kebetulan sama dengan kode publikasi halaman lain, yang menang kode publikasinya.

#### Pagar lokasi

Halaman yang menyalakan `geofenceEnabled` hanya terbuka bagi pengunjung dalam radius
`geofenceRadiusM` meter dari (`latitude`, `longitude`). Koordinat pengunjung dikirim sebagai
`?lat=&lng=` (GET) atau field `lat`/`lng` (POST) dan diperiksa di server pada **setiap**
endpoint publik — konfigurasi halaman, papan status, isi otomatis, dan pengambilan nomor.

`GET /api/public/{publishCode}` membalas dengan bentuk yang lebih pendek selama pengunjung
belum terbukti berada di dalam jangkauan:

```jsonc
{
  "access": "geofenced",          // "granted" bila boleh masuk
  "geofence": {
    "required": true,
    "inside": false,
    "radiusM": 1000,
    "latitude": -6.175392,        // titik pusat — supaya pengunjung tahu tujuannya
    "longitude": 106.827153,
    "distanceM": 119412           // null selama lokasinya belum diberikan
  },
  "page": { "title": "…", "subtitle": "…", "logoUrl": null, "theme": { } },
  "organization": { "name": "…", "logoUrl": null }
}
```

Daftar layanan, formulir, dan status buka TIDAK ikut dikirim pada bentuk ini. Endpoint lain
menolak dengan `400` `OUTSIDE_GEOFENCE`.

> Pagar ini menahan, bukan mengunci: koordinat berasal dari peramban pengunjung dan bisa
> dipalsukan. Pagar yang menyala tanpa titik koordinat diperlakukan sebagai mati, dan API admin
> menolak menyalakannya sebelum titiknya diisi.

### `GET /api/public/{publishCode}`

Konfigurasi halaman: branding, daftar layanan beserta jumlah yang menunggu, definisi formulir aktif,
dan status buka/tutup.

```json
{
  "page": { "title": "Demo Organization", "subtitle": "Silakan ambil nomor antrean", "theme": { "primaryColor": "#1b5cf5" } },
  "openState": { "isOpen": true, "acceptsNewQueue": true, "message": "Layanan sedang dibuka",
                 "openTime": "08:00", "closeTime": "16:00", "serviceDate": "2026-09-05" },
  "queueTypes": [{ "id": "01M1…", "code": "A", "name": "Pelayanan Umum", "waitingCount": 3, "estServiceSeconds": 480 }],
  "form": { "fields": [{ "key": "full_name", "label": "Nama Lengkap", "type": "TEXT", "isRequired": true }] }
}
```

### `POST /api/public/{publishCode}/queue`

Ambil nomor antrean. Rate limit bawaan 20 permintaan/menit per IP (`RATE_LIMIT_*`).

```json
{
  "queueTypeId": "01M1…",
  "values": { "full_name": "Budi Santoso", "phone": "081234567890", "purpose": "Konsultasi" }
}
```

Respons `201`:

```json
{
  "queueNumber": "A001",
  "token": "1yfNS66_VlZqie_4bbbWMBzfZJtYIdOFE9ZqIdOGtzA",
  "queueType": { "code": "A", "name": "Pelayanan Umum", "color": "#1b5cf5" },
  "serviceDate": "2026-09-05"
}
```

`values` divalidasi terhadap definisi formulir aktif milik event — field yang tidak dikenal dibuang.

Bila formulir aktif menyalakan `requireCaptcha`, sertakan `sliderToken` hasil captcha geser —
tanpa itu permintaan ditolak `400` `CAPTCHA_REQUIRED`. Status wajib-tidaknya dikabarkan pada
`GET /api/public/{publishCode}` sebagai `form.requireCaptcha`.

### `GET /api/public/{publishCode}/status`

Papan ringkas: nomor yang sedang dipanggil per layanan, jumlah menunggu, dan nomor berikutnya.

### `GET /api/public/track/{token}`

Status satu antrean memakai token publik (bukan ID database).

```json
{
  "queueNumber": "A001",
  "status": "WAITING",
  "position": { "ahead": 3, "estimateSeconds": 1440 },
  "nowServing": { "queueNumber": "A019", "counterName": "Loket 1" },
  "queueType": { "name": "Pelayanan Umum", "color": "#1b5cf5" },
  "counter": null,
  "ratingEnabled": true,
  "testimonial": null
}
```

### `POST /api/public/track/{token}/testimonial`

Penilaian pengunjung setelah dilayani (§23). Hanya diterima bila antrean berstatus `COMPLETED`,
fitur rating menyala, dan antrean itu belum pernah dinilai.

```json
{ "rating": 5, "comment": "Pelayanan cepat dan ramah." }
```

| Kode | Sebab |
|---|---|
| `QUEUE_INVALID_TRANSITION` | Layanan belum selesai |
| `CONFLICT` | Antrean sudah pernah dinilai |
| `RATING_DISABLED` | Fitur penilaian dimatikan admin |

Testimoni baru berstatus menunggu moderasi, kecuali `feedback.autoApprove` dinyalakan.

### `POST /api/public/{publishCode}/autofill`

Isi otomatis formulir dari sumber data eksternal (§6).

```json
{ "lookup": "0012345" }
```

Balasannya **hanya** berisi pasangan kunci–nilai untuk field yang benar-benar ada di formulir aktif:

```json
{ "nama_lengkap": "Siti Aminah", "tanggal_lahir": "1990-04-17", "no_hp": "6281234567890" }
```

Respons mentah dari sistem eksternal tidak pernah diteruskan ke pengunjung. Field yang dikembalikan
sumber data tetapi tidak dipetakan — atau dipetakan ke kunci yang tidak ada di formulir — dibuang.

---

## Operator

Butuh sesi + permission `queue.*`. Operator hanya dapat menyentuh jenis antrean yang di-assign kepadanya.

| Endpoint | Fungsi |
|---|---|
| `GET /api/operator/workspace` | Daftar penugasan (layanan + loket + event) |
| `GET /api/operator/board?queueTypeId=` | Papan kerja: sedang dilayani, menunggu, dilewati, riwayat, statistik |
| `POST /api/operator/queue/next` | Panggil antrean berikutnya |
| `POST /api/operator/queue/{id}/call` | Panggil nomor tertentu (termasuk yang SKIPPED); `{ "priority": true }` menandainya prioritas |
| `POST /api/operator/queue/{id}/recall` | Panggil ulang |
| `POST /api/operator/queue/{id}/serving` | Tandai mulai dilayani |
| `POST /api/operator/queue/{id}/skip` | Lewati |
| `POST /api/operator/queue/{id}/complete` | Selesai |
| `POST /api/operator/queue/{id}/no-show` | Tidak hadir |
| `POST /api/operator/queue/{id}/cancel` | Batalkan (`{ "reason": "…" }`) |

**`POST /api/operator/queue/next`**

```json
{ "queueTypeId": "01M1…", "counterId": "01M1…" }
```

Menekan `next` juga menutup antrean yang sedang dilayani operator tersebut sebagai `COMPLETED`
(waktu layanan dicatat), lalu memanggil antrean menunggu berikutnya.

**`POST /api/operator/queue/{id}/call` — panggilan prioritas**

```json
{ "counterId": "01M1…", "priority": true }
```

`priority: true` menaikkan `queues.priority` ke 10 (`QUEUE_PRIORITY.PRIORITY`) sekaligus memanggil
nomornya. Akibatnya:

- payload siaran `queue.called` membawa `priority`, dan layar menampilkan penanda **PRIORITAS**;
- pengumuman suara menyebut "Antrean prioritas" sebelum nomornya;
- penandaannya tersimpan, jadi ikut terlihat di riwayat antrean dan ekspor.

Yang **tidak** berubah: urutan NEXT untuk nomor itu. Kolom `priority` memang kunci urutan pertama
NEXT (`ORDER BY priority DESC, sequence_number ASC`), tetapi hanya berlaku bagi antrean yang masih
`WAITING` — sedangkan penandaan di sini terjadi tepat saat nomornya dipanggil. Panggilan biasa tidak
pernah menurunkan prioritas yang sudah ada (`GREATEST`), jadi memanggil ulang nomor prioritas tetap
mempertahankan penandanya.

Transisi status yang sah:

```
WAITING  → CALLED, SERVING, SKIPPED, CANCELLED
CALLED   → SERVING, COMPLETED, SKIPPED, NO_SHOW, CANCELLED
SERVING  → COMPLETED, SKIPPED, CANCELLED
SKIPPED  → CALLED, SERVING, CANCELLED
COMPLETED / CANCELLED → (final)
```

---

## Admin

Butuh sesi + permission sesuai modul.

### Event

| Endpoint | Permission |
|---|---|
| `GET /api/admin/events` | `event.view` |
| `POST /api/admin/events` | `event.manage` |
| `GET /api/admin/events/{id}` | `event.view` |
| `PATCH /api/admin/events/{id}` | `event.manage` |
| `DELETE /api/admin/events/{id}` | `event.manage` |
| `POST /api/admin/events/{id}/status` | `event.control` |
| `PUT /api/admin/events/{id}/schedules` | `event.manage` |

`POST …/status` menerima `{ "status": "OPEN" | "PAUSED" | "CLOSED" | … }` dan menyiarkan
`event.opened` / `event.paused` / `event.closed`.

### Jenis Antrean & Loket

| Endpoint | Permission |
|---|---|
| `GET/POST /api/admin/queue-types` | `queue_type.view` / `queue_type.manage` |
| `PATCH/DELETE /api/admin/queue-types/{id}` | `queue_type.manage` |
| `POST /api/admin/queue-types/reorder` | `queue_type.manage` |
| `GET/POST /api/admin/counters` | `queue_type.view` / `counter.manage` |
| `PATCH/DELETE /api/admin/counters/{id}` | `counter.manage` |
| `PUT /api/admin/counters/{id}/services` | `counter.manage` |

Format nomor mendukung placeholder `{prefix}` `{code}` `{seq}` `{yyyy}` `{mm}` `{dd}`,
mis. `{prefix}{seq}` → `A001`, `{code}-{seq}` → `UM-001`.

### Pengguna & Penugasan

| Endpoint | Permission |
|---|---|
| `GET /api/admin/users` | `user.view` |
| `POST /api/admin/users` | `user.manage` |
| `PATCH/DELETE /api/admin/users/{id}` | `user.manage` |
| `POST /api/admin/users/{id}/password` | `user.manage` |
| `GET /api/admin/assignments` | `assignment.manage` / `user.view` |
| `POST /api/admin/assignments` | `assignment.manage` |
| `DELETE /api/admin/assignments/{id}` | `assignment.manage` |
| `GET /api/admin/assignments/candidates?eventId=` | `assignment.manage` / `user.view` |

**Operator → loket, loket → layanan (§12, §28).**

Cakupan operator TIDAK disimpan per jenis antrean. Ia didudukkan di **satu loket**, dan loket
itulah yang menentukan layanan apa saja yang ia tangani:

```
PUT /api/admin/counters/{id}/services   { "queueTypeIds": ["01…A", "01…C"] }
POST /api/admin/assignments             { "userId": "01…", "counterId": "01…" }
```

Karena loket dimiliki satu event, "satu operator satu event" terjaga oleh struktur — bukan oleh
pemeriksaan tambahan. Menambah layanan pada loket langsung berlaku bagi semua operator yang
duduk di sana.

Penolakan yang mungkin muncul:

| `code` | Kapan | Jalan keluar |
|---|---|---|
| `COUNTER_HAS_NO_SERVICE` | Loket tujuan belum melayani jenis antrean apa pun, **atau** layanan loket dikosongkan padahal masih ada operator di sana | Atur layanan loket lebih dulu / pindahkan operatornya |
| `OPERATOR_ALREADY_SEATED` | Operator sudah duduk di loket lain | Kirim `moveFromOtherCounter: true` |
| `CONFLICT` | Operator masih memegang antrean `CALLED`/`SERVING` | Selesaikan antreannya dulu — jangan mencabut orang yang sedang melayani |

```json
{
  "success": false,
  "code": "OPERATOR_ALREADY_SEATED",
  "message": "Operator ini sudah duduk di loket \"Loket 1\" pada event \"Demo Service\". Satu operator hanya melayani satu event — pilih \"pindahkan\" bila memang ingin dipindahkan."
}
```

`GET …/candidates?eventId=` mengembalikan calon operator beserta tempat duduknya sekarang, supaya
antarmuka bisa memberi tahu SEBELUM admin menekan simpan:

```json
[{ "id": "01M1…", "name": "Budi", "email": "budi@…", "isActive": true,
   "seatedAt": { "counter": { "id": "01L1…", "code": "L1", "name": "Loket 1" },
                 "event": { "id": "01M2…", "name": "Demo Service", "status": "OPEN" } },
   "seatedHere": false,
   "assignedEvent": { "id": "01M2…", "name": "Demo Service", "status": "OPEN" } }]
```

`GET /api/admin/assignments` mengembalikan satu baris per operator: `{ id, user, counter, event, services }` —
`services` diturunkan dari loket, jadi tidak ada baris terpisah per layanan lagi.

Reset kata sandi mencabut seluruh sesi aktif pengguna tersebut.

### Halaman Publik & QR

| Endpoint | Permission |
|---|---|
| `GET/POST /api/admin/public-pages` | `public_page.view` / `public_page.manage` |
| `GET /api/admin/public-pages/{id}` | `public_page.view` — satu halaman, dipakai builder |

Respons halaman publik membawa dua alamat: `url` (kode publikasi) dan `slugUrl` (`null` bila
slugnya belum diisi).

Pagar lokasi diatur lewat `geofenceEnabled`, `latitude`, `longitude` (–90..90 / –180..180), dan
`geofenceRadiusM` (50–50.000 m, bawaan 1.000).
| `PATCH/DELETE /api/admin/public-pages/{id}` | `public_page.manage` |
| `POST /api/admin/public-pages/{id}/publish` | `public_page.publish` |
| `POST /api/admin/public-pages/{id}/qr` | `public_page.manage` |
| `GET /api/admin/public-pages/{id}/qr` | `public_page.view` |

`GET …/qr` mengembalikan **berkas gambar**, bukan JSON:

```
GET /api/admin/public-pages/{id}/qr?format=png&size=1200&download=true
GET /api/admin/public-pages/{id}/qr?format=svg
```

`POST …/qr` dengan `{ "rotateCode": true }` mengganti kode publikasi sekaligus — tautan lama mati,
versi QR bertambah, dan versi lama tetap tersimpan untuk audit.

#### Tampilan halaman (`theme`)

Seluruh setelan tampilan disimpan pada satu kolom JSON `theme` dan divalidasi
`publicPageThemeSchema` (`shared/schemas/public-page.ts`) — bukan JSON bebas. Kunci yang tidak
dikenal dibuang, kunci yang hilang memakai nilai bawaannya, jadi halaman lama yang hanya
menyimpan `primaryColor`/`secondaryColor`/`footerText` tetap sah.

```jsonc
{
  "primaryColor": "#1b5cf5",
  "secondaryColor": "#0f172a",
  "accentColor": "#337dff",        // opsional; kosong = ikut primaryColor
  "fontFamily": "",
  "footerText": "",
  "hero": {
    "enabled": true,
    "title": "", "subtitle": "", "description": "",   // kosong = ikut judul/subjudul halaman
    "align": "center",             // left | center | right
    "height": "medium",            // compact | medium | large
    "overlay": 72,                 // kepekatan lapisan di atas gambar latar, persen
    "ctaEnabled": true, "ctaText": "Ambil Nomor Antrean",
    "showDate": true, "showTime": true, "showLocation": false, "location": ""
  },
  "services": {
    "title": "Pilih layanan", "subtitle": "",
    "columns": 3,                  // 2–4, hanya berlaku di layar lebar
    "cardStyle": "elevated",       // elevated | outlined | soft
    "showIcon": true, "showWaiting": true, "showEstimate": true,
    "ctaStyle": "button"           // button | link
  },
  "info": { "title": "Informasi layanan", "style": "cards" },  // cards | plain
  "footer": { "showLogo": true, "showOrganization": true, "showPoweredBy": true }
}
```

`GET /api/public/{publishCode}` mengembalikan `page.theme` yang SUDAH lengkap dengan nilai
bawaannya, sehingga perender di klien tidak perlu menambal sendiri.

### Formulir Dinamis

| Endpoint | Permission |
|---|---|
| `GET/POST /api/admin/forms` | `form.view` / `form.manage` |
| `GET/DELETE /api/admin/forms/{id}` | `form.view` / `form.manage` |
| `PATCH /api/admin/forms/{id}` | `form.manage` — `name`, `description`, `dataSourceId`, `requireCaptcha` |
| `PUT /api/admin/forms/{id}/fields` | `form.manage` |
| `POST /api/admin/forms/{id}/activate` | `form.manage` |

`PUT …/fields` menyimpan seluruh susunan sekaligus:

```json
{
  "fields": [
    { "key": "full_name", "label": "Nama Lengkap", "type": "TEXT", "isRequired": true },
    { "key": "layanan", "label": "Jenis Layanan", "type": "SELECT", "isRequired": true,
      "options": [{ "label": "Umum", "value": "umum" }] }
  ]
}
```

Tipe field: `TEXT TEXTAREA NUMBER PHONE EMAIL DATE DATETIME SELECT RADIO CHECKBOX FILE HIDDEN`.
Field yang dihapus melepas tautan dari jawaban lama (`formFieldId` menjadi `null`) sehingga riwayat
pengunjung tidak ikut hilang. Hanya satu formulir aktif per event.

### Antrean & Dashboard

| Endpoint | Fungsi |
|---|---|
| `GET /api/admin/queues?eventId=&date=&status=&queueTypeId=&search=&page=&perPage=` | Daftar antrean (live & riwayat) |
| `GET /api/admin/dashboard?eventId=&date=` | Ringkasan harian + volume per jam |

### Display

| Endpoint | Permission |
|---|---|
| `GET/POST /api/admin/displays` | `display.view` / `display.manage` |
| `PATCH /api/admin/displays/{id}` | `display.manage` — ganti nama, template, atau jenis antrean |
| `DELETE /api/admin/displays/{id}` | `display.manage` |
| `POST /api/admin/displays/{id}/reset-pairing` | `display.manage` |
| `GET /api/display/{deviceCode}/state` | publik (dipakai layar) |
| `GET /api/display/{deviceCode}/tts?text=` | publik (dipakai layar) |
| `POST /api/display/{deviceCode}/pair` | publik, sekali per perangkat |

`GET /state` mengembalikan papan antrean, pengumuman aktif, template yang terpasang (bila ada),
serta peta `mediaById` dan `playlistById` berisi URL berkas yang dirujuk widget — sehingga layar
tidak perlu memanggil endpoint tambahan.

`settings` pada respons `/state` membawa perilaku suara yang sudah digabung dari
pengaturan sistem + penimpa event: `voiceEnabled`, `voiceLanguage`, `voiceProvider`
(`browser` | `external` | `chime`), dan `voiceChimeUrl` — URL berkas nada panggil yang siap
diputar, atau `null` bila tidak diatur (atau berkasnya sudah dihapus).

**Nada panggil punya dua sumber.** Nilai `display.voiceChimeMediaId` boleh berupa
`system:toneN` — nada bawaan yang ikut di dalam aplikasi (`public/tone/`, sembilan
pilihan, lihat `shared/constants/tones.ts`) — atau id berkas Media Library. Nada bawaan
tidak menyentuh database sama sekali dan tidak bisa terhapus dari halaman Media, jadi
instalasi baru langsung punya bunyi tanpa harus mengunggah apa pun.

**Empat mode suara.** `browser` membacakan nomor dengan suara yang terpasang di
perangkat layar, `gtranslate` memakai mesin TTS Google Translate lewat proxy (gratis,
tanpa kunci API, butuh internet), `external` memakai layanan TTS sendiri lewat proxy
yang sama, dan `chime` TIDAK membacakan nomor sama sekali — cukup berkas audio dari
Media Library. Nada panggil (`voiceChimeUrl`) dibunyikan lebih
dulu pada ketiga mode. Bila mode `chime` dipilih tetapi nadanya belum diatur, layar
jatuh ke suara peramban: panggilan yang tidak berbunyi sama sekali lebih merugikan
daripada suara bawaan.

**TTS lewat proxy.** Bila `voiceProvider` bernilai `gtranslate` atau `external`, layar
TIDAK memanggil layanan TTS langsung melainkan `GET /api/display/{deviceCode}/tts?text=…`.
Untuk `gtranslate` server menyusun sendiri alamat mesin Translate (`server/utils/google-translate-tts.ts`);
untuk `external` ia memakai templat URL dari pengaturan (`{text}` dan `{lang}`),
dengan penjaga SSRF yang sama seperti sumber data, batas waktu 8 detik, batas 2 MB, dan
penolakan jawaban yang bukan `audio/*`. Alasannya: templat URL sering memuat kunci API —
kalau dipanggil dari peramban, kuncinya terbaca siapa pun yang membuka layar — dan CSP
aplikasi ini hanya mengizinkan koneksi ke origin sendiri. Bila TTS eksternal gagal, layar
jatuh ke suara peramban, bukan diam.

Selain `board` (per JENIS ANTREAN), respons juga membawa `counters` (per LOKET) untuk widget
"Nomor per Loket" — satu layanan sering dilayani 2–4 loket sekaligus:

```json
{
  "counters": [
    {
      "id": "01L1…", "code": "L1", "name": "Loket 1",
      "services": [{ "id": "01A…", "code": "A", "name": "Pelayanan Umum", "color": "#1b5cf5" }],
      "current": {
        "queueNumber": "A023", "status": "SERVING", "priority": 0, "lastCalledAt": "2026-09-11T04:20:00.000Z",
        "queueType": { "id": "01A…", "code": "A", "name": "Pelayanan Umum", "color": "#1b5cf5" }
      }
    }
  ]
}
```

Hanya loket **aktif** yang disertakan, urut `displayOrder`. Perangkat bertipe `QUEUE_TYPE` hanya
menerima loket yang melayani layanan tersebut. Antrean yang dipanggil tanpa loket (pengawas lintas
layanan, §57.6) tidak muncul di sini — tidak ada kotak loket yang bisa mewakilinya.

### Pengumuman

| Endpoint | Permission |
|---|---|
| `GET/POST /api/admin/announcements` | `announcement.manage` |
| `PATCH/DELETE /api/admin/announcements/{id}` | `announcement.manage` |

Setiap perubahan menyiarkan `announcement.created` ke room event, jadi teks berjalan pada layar
langsung ikut berubah tanpa reload.

### Media Library

| Endpoint | Permission |
|---|---|
| `GET /api/admin/media` | `media.view` — filter `type` (IMAGE/VIDEO/AUDIO) & `search` |
| `POST /api/admin/media` | `media.manage` — `multipart/form-data` |
| `PATCH /api/admin/media/{id}` | `media.manage` — ubah nama |
| `DELETE /api/admin/media/{id}` | `media.manage` |
| `GET /media/**` | publik — berkas itu sendiri |

Unggahan memakai `multipart/form-data` dengan kolom:

| Kolom | Isi |
|---|---|
| `file` | berkas (wajib) |
| `name` | nama tampilan (opsional) |
| `durationSeconds` | durasi video, dibaca browser saat unggah (opsional) |

Tipe diperiksa dari **magic byte**, bukan nama berkas atau Content-Type: JPG, PNG, WEBP, MP4.
Batas bawaan 10 MB untuk gambar dan 200 MB untuk video (`MEDIA_MAX_IMAGE_MB`, `MEDIA_MAX_VIDEO_MB`).
Media yang masih dipakai widget atau playlist tidak bisa dihapus (`CONFLICT`).

### Playlist

| Endpoint | Permission |
|---|---|
| `GET/POST /api/admin/playlists` | `media.view` / `media.manage` |
| `PATCH/DELETE /api/admin/playlists/{id}` | `media.manage` |
| `PUT /api/admin/playlists/{id}/items` | `media.manage` — ganti seluruh isi sekaligus |

```json
{ "items": [{ "mediaId": "01M1…", "durationSeconds": 10 }] }
```

### Display Template (Display Builder)

| Endpoint | Permission |
|---|---|
| `GET /api/admin/display-templates` | `display.view` |
| `POST /api/admin/display-templates` | `display_template.manage` |
| `GET /api/admin/display-templates/{id}` | `display.view` |
| `PATCH/DELETE /api/admin/display-templates/{id}` | `display_template.manage` |
| `PUT /api/admin/display-templates/{id}/widgets` | `display_template.manage` |
| `POST /api/admin/display-templates/{id}/duplicate` | `display_template.manage` |

Kanvas acuan selalu 1920×1080; renderer menskalakannya ke ukuran layar sebenarnya.
`PUT …/widgets` menyimpan seluruh tata letak sekaligus dan menyuruh perangkat yang memakai template
tersebut memuat ulang:

```json
{
  "widgets": [
    {
      "type": "CURRENT_QUEUE", "x": 120, "y": 200, "width": 900, "height": 500, "zIndex": 1,
      "config": { "queueTypeId": "01M1…", "showCounter": true },
      "style": { "color": "#ffffff", "backgroundColor": "#0f172a", "fontSize": 180, "align": "center" },
      "isVisible": true
    }
  ]
}
```

Tipe widget: `CURRENT_QUEUE COUNTER_BOARD VISITOR_INFO QUEUE_LIST CLOCK DATE LOGO IMAGE VIDEO TEXT
RUNNING_TEXT ANNOUNCEMENT ORG_NAME QRCODE PLAYLIST`. Widget bertipe media/playlist merujuk berkas lewat
`mediaId` / `playlistId`. Template yang masih dipakai perangkat tidak bisa dihapus (`CONFLICT`).

`COUNTER_BOARD` — "Nomor per Loket" — menggambar satu kotak untuk tiap loket beserta nomor yang
sedang dilayaninya:

```json
{
  "type": "COUNTER_BOARD", "x": 60, "y": 660, "width": 1800, "height": 300, "zIndex": 3,
  "config": { "queueTypeId": "01A…", "columns": 0, "showEmpty": true, "showService": true },
  "style": { "color": "#ffffff", "backgroundColor": "#0f172a", "fontSize": 92, "align": "center" }
}
```

| `config` | Arti |
|---|---|
| `queueTypeId` | Hanya loket yang MELAYANI layanan ini. Kosong = seluruh loket event |
| `columns` | `0` = mengikuti jumlah loket (maksimal 4 per baris), atau 1–6 |
| `showEmpty` | `false` menyembunyikan loket yang belum memanggil |
| `showService` | Nama layanan di bawah nomor tiap loket |

Nomor yang ditampilkan adalah nomor yang benar-benar ada di loket itu — termasuk bila loket tersebut
sedang melayani layanan lain (satu loket boleh melayani beberapa layanan, §12). Nomor prioritas
mendapat penanda `★ PRIORITAS` di kotaknya.

`VISITOR_INFO` — "Data Pengunjung" — menampilkan nomor antrean beserta **isian formulir** pengunjung
yang sedang dipanggil (§18), mis. `A023` + `Nama: Budi Santoso`:

```json
{
  "type": "VISITOR_INFO", "x": 260, "y": 240, "width": 1400, "height": 420, "zIndex": 1,
  "config": {
    "queueTypeId": "01A…",
    "fields": [{ "key": "nama", "label": "Nama" }],
    "showQueueNumber": true, "showLabel": true, "mask": false
  }
}
```

| `config` | Arti |
|---|---|
| `fields` | Isian yang ditampilkan. `key` = kunci field pada Form Builder; `label` disalin saat admin memilih, sehingga layar tidak perlu memuat definisi formulir |
| `showQueueNumber` | Nomor antrean di atas isian (default aktif) |
| `showLabel` | Tampilkan label di depan nilai (`Nama: Budi`) |
| `mask` | Samarkan separuh akhir nilainya (`Budi San•••`) untuk ruang tunggu yang ramai |

**Hanya field yang dipasang di template yang dikirim ke perangkat.** `GET /state` menghitung kunci
yang dipakai widget, lalu `board[].current.fields` dan `counters[].current.fields` hanya memuat kunci
tersebut — nomor HP atau nomor identitas tidak pernah ikut terkirim ke layar hanya karena pengunjung
mengisinya. Nilainya diambil dari snapshot jawaban saat pengunjung mendaftar, jadi mengubah formulir
tidak mengubah nomor yang sedang tampil.

---

## Rate Limit

Berbasis IP, in-memory (ganti ke Redis saat multi-instance).

| Cakupan | Batas |
|---|---|
| Ambil antrean publik | `RATE_LIMIT_MAX` (default 20) / `RATE_LIMIT_WINDOW_MS` (default 60 dtk) |
| Baca halaman publik | 120 / menit |
| Lacak antrean | 240 / menit |
| State display | 300 / menit |
| Pairing display | 10 / menit |
| Kirim testimoni | 10 / menit |
| Autofill formulir | 15 / menit |
| Uji koneksi sumber data | 20 / menit (walau jalur admin — memicu permintaan keluar) |
| Endpoint auth | 30 / menit (bawaan Better Auth) |

Respons menyertakan `X-RateLimit-Limit` dan `X-RateLimit-Remaining`.

Selain rate limit, tiap halaman publik punya `maxPerIpPerDay` (batas jumlah antrean per perangkat per hari)
yang dapat diatur admin; `0` berarti tanpa batas.

### Analytics, Laporan & Ekspor

| Endpoint | Permission |
|---|---|
| `GET /api/admin/analytics?eventId=&from=&to=&queueTypeId=&operatorId=` | `analytics.view` / `report.view` |
| `GET /api/admin/reports/daily?eventId=&date=` | `report.view` |
| `GET/POST /api/admin/exports` | `report.export` |
| `GET /api/admin/exports/{id}/download` | `report.export` / `report.view` |
| `DELETE /api/admin/exports/{id}` | `report.export` |
| `GET /api/admin/audit-logs?action=&entity=&userId=&search=&page=` | `audit.view` |

Rentang bawaan analytics adalah 30 hari terakhir. Seluruh pengelompokan tanggal dan jam memakai
timezone **event** (`CONVERT_TZ`), bukan UTC — grafik per jam akan bergeser bila tidak.

`POST /api/admin/exports` mengantrekan pekerjaan dan langsung membalas `202`; pemrosesan berjalan di
latar belakang (§38), jadi rentang tanggal panjang tidak membuat permintaan HTTP menggantung.

```json
{ "type": "QUEUES", "format": "XLSX", "eventId": "01M1…", "from": "2026-08-01", "to": "2026-09-06" }
```

| Field | Nilai |
|---|---|
| `type` | `QUEUES` · `VISITORS` · `OPERATORS` |
| `format` | `CSV` (BOM UTF-8, ramah Excel) · `XLSX` |

Status pekerjaan: `QUEUED` → `PROCESSING` → `DONE` / `FAILED`. Setelah `DONE`, unduh lewat
`GET …/download` yang mengembalikan berkas, bukan amplop JSON.

Laporan harian tersedia sebagai halaman siap cetak di `/admin/reports` — cetak lewat peramban untuk
menghasilkan PDF; sisa antarmuka disembunyikan oleh aturan `@media print`.

### Pengunjung

| Endpoint | Permission |
|---|---|
| `GET /api/admin/visitors?eventId=&search=&queueTypeId=&from=&to=&page=` | `visitor.view` |
| `GET /api/admin/visitors/{id}` | `visitor.view` |

Pencarian menyapu nama, nomor HP, email, nomor identitas, sekaligus nomor antrean. Rinciannya memuat
jawaban formulir (diberi label dari definisi field yang masih ada) beserta seluruh riwayat antrean.

### Rating & Testimoni

| Endpoint | Permission |
|---|---|
| `GET /api/admin/testimonials?eventId=&status=&rating=&from=&to=&search=&page=` | `feedback.view` |
| `PATCH /api/admin/testimonials/{id}` | `feedback.moderate` |
| `DELETE /api/admin/testimonials/{id}` | `feedback.moderate` |

`status` menerima `all` · `approved` · `pending`. Respons daftar menyertakan `summary`:

```json
{ "total": 42, "pending": 3, "average": 4.6, "byRating": { "5": 30, "4": 8 }, "satisfactionRate": 90 }
```

Ekspor testimoni memakai pusat ekspor dengan `type: "TESTIMONIALS"`.

### Integrasi Sumber Data

| Endpoint | Permission |
|---|---|
| `GET /api/admin/data-sources` | `integration.view` |
| `POST /api/admin/data-sources` | `integration.manage` |
| `GET/PATCH/DELETE /api/admin/data-sources/{id}` | `integration.view` / `integration.manage` |
| `POST /api/admin/data-sources/{id}/test` | `integration.manage` |
| `PATCH /api/admin/forms/{id}` (menyambungkan `dataSourceId`) | `form.manage` |

```json
{
  "name": "SIMRS Pasien",
  "type": "REST",
  "baseUrl": "https://simrs.contoh.id/api/patient/{lookup}",
  "httpMethod": "GET",
  "authType": "API_KEY",
  "credentials": { "authType": "API_KEY", "in": "header", "name": "X-API-Key", "value": "…" },
  "queryTemplate": { "lookupFieldKey": "no_rm", "rootPath": "data", "query": {}, "body": {} },
  "timeoutMs": 5000,
  "mappings": [
    { "sourcePath": "patient.name", "targetFieldKey": "nama_lengkap", "transform": "capitalize" }
  ]
}
```

- `{lookup}` pada URL maupun parameter diganti nilai yang diketik pengunjung.
- `transform`: `none` · `trim` · `uppercase` · `lowercase` · `capitalize` · `digits` · `date`.
- **Kredensial tidak pernah dikembalikan.** Respons hanya memuat `hasCredentials: true`.
  Mengirim PATCH tanpa field `credentials` mempertahankan kredensial lama.
- Permintaan keluar dijaga: skema wajib http/https, alamat internal ditolak, redirect tidak diikuti,
  ada batas waktu, dan ukuran respons dipotong. Lihat `server/utils/ssrf.ts`.

### Pengaturan Sistem

| Endpoint | Permission |
|---|---|
| `GET /api/admin/settings` | `setting.view` |
| `PUT /api/admin/settings` | `setting.manage` |
| `POST /api/admin/settings/reset` | `setting.manage` |
| `GET /api/admin/organization` | `setting.view` / `setting.manage` |
| `PATCH /api/admin/organization` | `setting.manage` |

**Nama organisasi bukan pengaturan sistem.** Ia tetap tinggal di kolom
`organizations.name` karena di situlah seluruh antarmuka sudah membacanya — header
panel admin, halaman antrean pengunjung, layar display, tiket cetak, dan kop laporan.
Menyalinnya ke tabel pengaturan hanya akan melahirkan dua sumber kebenaran. Karena itu
halaman Pengaturan menyuntingnya lewat endpoint terpisah (`PATCH /api/admin/organization`,
badan: `{ "name": "…" }`), walau tombol simpannya sama dengan pengaturan lain.

Slug organisasi TIDAK ikut berubah, jadi tautan publik dan QR yang sudah dicetak tetap
berlaku. Perubahannya tercatat di audit log sebagai `ORGANIZATION_UPDATED`.

Katalognya ada di `shared/constants/settings.ts` dan dipakai bersama server & antarmuka.
Kunci di luar katalog diabaikan; angka dijepit ke rentangnya.

```json
{ "values": { "queue.recallLimit": 3, "feedback.ratingEnabled": true } }
```

Sebagian kunci bisa ditimpa per event lewat `events.settings` (`recallLimit`, `maxWaitingPerType`,
`ratingEnabled`, `voiceEnabled`, `voiceLanguage`) — diatur dari halaman detail event.

### Role & Izin

| Endpoint | Permission |
|---|---|
| `GET /api/admin/roles` | `role.manage` / `user.view` |
| `POST /api/admin/roles` | `role.manage` |
| `PATCH /api/admin/roles/{id}` | `role.manage` |
| `DELETE /api/admin/roles/{id}` | `role.manage` |

Role bawaan tidak bisa dihapus atau diganti namanya; izinnya masih boleh disesuaikan kecuali
SUPERADMIN, yang memang melewati seluruh pemeriksaan izin. Role kustom hanya bisa dihapus bila tidak
ada pengguna yang memakainya. Perubahan izin membuang cache konteks auth sehingga langsung berlaku.

### Penjadwal

| Endpoint | Permission |
|---|---|
| `POST /api/admin/scheduler/run` | `event.control` |

Menjalankan satu putaran penyelarasan status event dengan jadwalnya (§10) sekarang juga. Penjadwal
sendiri berjalan tiap menit di dalam proses; endpoint ini untuk penyelarasan seketika dan pengujian.
Operasinya idempoten.

```json
{
  "checked": 5,
  "opened": [{ "eventId": "01M1…", "name": "Poli Umum" }],
  "closed": [{ "eventId": "01M2…", "name": "Poli Gigi", "status": "SCHEDULED" }],
  "at": "2026-09-08T09:05:00.000Z"
}
```

Perhatikan `closed[].status`: penutupan **harian** menghasilkan `SCHEDULED` ("menunggu jadwal
berikutnya"), sedangkan `CLOSED` hanya untuk event yang melewati tanggal berakhirnya atau tidak
punya hari layanan lain. Event yang sudah `CLOSED` tidak pernah dibuka lagi oleh penjadwal, jadi
penutupan manual oleh admin tetap dihormati.
