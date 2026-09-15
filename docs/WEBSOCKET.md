# WebSocket ANTREAN

Realtime memakai **Socket.IO** yang menempel pada proses Nitro, jadi satu port melayani aplikasi
sekaligus realtime. Path: `/socket.io`.

Transport dicoba berurutan: HTTP long-polling lalu upgrade ke WebSocket. Bila WebSocket gagal
(proxy, jaringan kantor), koneksi tetap hidup lewat polling — halaman display juga punya polling
`GET /api/display/{deviceCode}/state` tiap 10 detik sebagai jaring pengaman terakhir.

---

## Menyambung

Klien **wajib** mengirim `auth` pada handshake. Klien tidak pernah menentukan sendiri room yang
diikuti — server yang memutuskan berdasarkan identitas yang bisa diverifikasi.

```ts
import { io } from 'socket.io-client'

const socket = io({
  path: '/socket.io',
  auth: { role: 'visitor', publicToken: '…' },
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 10_000,
})
```

| `role` | Kredensial | Room yang diikuti |
|---|---|---|
| `visitor` | `publicToken` antrean | `queue:{publicToken}`, `queue-type:{id}` |
| `display` | `deviceCode` (+ `deviceToken` bila sudah dipasangkan) | `display:{deviceId}`, `event:{eventId}`, `queue-type:{id}` bila display khusus |
| `operator` | cookie sesi | `queue-type:{id}` & `event:{id}` untuk tiap assignment, `admin:{orgId}` |
| `admin` | cookie sesi | `admin:{orgId}` + `event:{eventId}` bila disertakan dan berhak |

Koneksi yang gagal diverifikasi menerima event `error` lalu diputus.

Setelah berhasil, server mengirim satu kali:

```json
{ "role": "display", "deviceId": "01M1…" }   // event: state.snapshot
```

---

## Room

| Room | Diikuti oleh | Isi |
|---|---|---|
| `event:{eventId}` | display global, admin | seluruh perubahan antrean pada event + status event + pengumuman |
| `queue-type:{queueTypeId}` | display per layanan, operator | perubahan antrean satu layanan |
| `queue:{publicToken}` | satu pengunjung | perubahan antrean miliknya saja |
| `display:{deviceId}` | satu perangkat | perintah khusus perangkat |
| `admin:{organizationId}` | dashboard admin | agregat lintas event |

Penamaan room hanya didefinisikan di `shared/constants/socket.ts` (`ROOMS`), tidak pernah di-hardcode
di tempat lain.

---

## Event Server → Klien

| Event | Kapan |
|---|---|
| `queue.created` | Pengunjung mengambil nomor |
| `queue.called` | Operator memanggil (NEXT atau panggil spesifik); `priority` pada payload menandai panggilan prioritas |
| `queue.recalled` | Operator menekan panggil ulang |
| `queue.serving` | Antrean ditandai sedang dilayani |
| `queue.skipped` | Antrean dilewati |
| `queue.completed` | Antrean selesai |
| `queue.cancelled` | Antrean dibatalkan |
| `queue.updated` | Perubahan lain (mis. tidak hadir) |
| `event.opened` / `event.paused` / `event.closed` | Admin mengubah status event |
| `announcement.created` | Pengumuman baru untuk display |
| `display.updated` | Konfigurasi display berubah |
| `display.reload` | Perangkat diminta memuat ulang halaman |
| `state.snapshot` | Konfirmasi identitas setelah connect |
| `notification` | Pemberitahuan dalam aplikasi untuk panel admin (§47) |

### Payload antrean

Seluruh event `queue.*` memakai bentuk yang sama:

```json
{
  "queueId": "01M1R6RF0R6MYGVQFS0600H816",
  "queueNumber": "A001",
  "status": "CALLED",
  "eventId": "01M1…",
  "queueTypeId": "01M1…",
  "queueTypeName": "Pelayanan Umum",
  "queueTypeCode": "A",
  "queueTypeColor": "#1b5cf5",
  "counterName": "Loket 1",
  "operatorName": "Operator Satu",
  "publicToken": "1yfNS66_…",
  "visitorName": "Budi Santoso",
  "calledAt": "2026-09-05T07:15:36.603Z",
  "recallCount": 0,
  "serviceDate": "2026-09-05"
}
```

### Payload status event

```json
{ "eventId": "01M1…", "status": "CLOSED", "at": "2026-09-05T09:00:00.000Z" }
```

---

## Event Klien → Server

| Event | Pengirim | Fungsi |
|---|---|---|
| `display:ping` | display | Heartbeat; memperbarui `last_seen_at` dan status `ONLINE` |

Perangkat display juga otomatis ditandai `OFFLINE` saat socket-nya terputus.

---

## Urutan pada satu pemanggilan

```
Operator klik NEXT
   │
   ├─ POST /api/operator/queue/next
   │     └─ transaksi DB
   │          ├─ tutup antrean berjalan (COMPLETED + service_seconds)
   │          ├─ SELECT … FOR UPDATE SKIP LOCKED  ← operator lain melompati baris ini
   │          ├─ UPDATE … WHERE status='WAITING'  ← wajib mengenai tepat 1 baris
   │          └─ INSERT queue_events
   │     └─ COMMIT
   │
   ├─ broadcast (setelah commit, tidak pernah di dalam transaksi)
   │     ├─ event:{eventId}        → display global
   │     ├─ queue-type:{typeId}    → display layanan + operator lain
   │     ├─ queue:{publicToken}    → ponsel pengunjung
   │     └─ admin:{orgId}          → dashboard admin
   │
   └─ display menerima queue.called
         ├─ sorot nomor + animasi
         ├─ Web Speech API: "Nomor antrean A 0 0 1, silakan menuju Loket 1."
         └─ muat ulang state
```

Broadcast selalu dilakukan **setelah** commit — kalau tidak, layar bisa menampilkan nomor dari
transaksi yang akhirnya di-rollback.

---

## Ketahanan (§44)

- **Reconnect otomatis** dengan exponential backoff (500 ms → maks 10 dtk, faktor acak 0,5).
- **Indikator koneksi** di display, operator, dan halaman pengunjung.
- **Fallback polling** aktif saat socket terputus: display tiap 10 detik, pengunjung tiap 15 detik.
- **Heartbeat** `display:ping` tiap 10 detik saat tersambung, sehingga admin melihat status
  ONLINE/OFFLINE beserta waktu terakhir terlihat.
- **Layar penuh** disediakan lewat tombol pada bilah bawah display (`useFullscreen()`). Statusnya
  dibaca dari event `fullscreenchange`, jadi keluar lewat Esc pun membuat label tombol ikut berubah.

---

## Catatan Penerapan

- Socket.IO menempel pada proses Nitro (`server/plugins/socket.ts`), sehingga aplikasi **harus**
  dijalankan sebagai server Node — bukan serverless/edge.
- Untuk lebih dari satu instance, tambahkan Redis adapter Socket.IO agar broadcast menyeberang antar
  proses. Titik pemasangannya hanya satu: `registerIo()` di `server/realtime/emitters.ts`.
- Seluruh emit melewati `server/realtime/emitters.ts`; tidak ada `io.emit` liar di dalam service.
- **Pemberitahuan** (§47) dikirim lewat `NotificationService`, bukan langsung ke socket. Kanal
  `BROWSER` memakai event `notification` ke room admin; kanal email/WhatsApp/SMS sudah terdaftar
  sebagai driver tetapi belum dikonfigurasi, dan pengirimannya ditandai FAILED dengan alasan jelas
  alih-alih berpura-pura berhasil. Tiap pengiriman tercatat di tabel `notifications`.
- **Penolakan identitas menghentikan koneksi.** Server memanggil `socket.disconnect(true)`; klien
  Socket.IO tidak mencoba menyambung ulang setelah `io server disconnect`, sehingga token display
  yang salah tidak berubah menjadi banjir percobaan.

### Payload `notification`

```json
{
  "id": "01M1…",
  "type": "testimonial.created",
  "payload": { "queueNumber": "A012", "rating": 5, "needsModeration": true },
  "createdAt": "2026-09-06T07:15:20.114Z"
}
```
