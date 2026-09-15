# PROJECT: ANTREAN — Configurable Queue Management System

Buat sebuah aplikasi web modern bernama **ANTREAN**.

ANTREAN adalah **Queue Management System (QMS)** yang bersifat generic dan configurable sehingga dapat digunakan untuk berbagai kebutuhan:

* Rumah sakit / klinik
* Instansi pemerintahan
* Bank
* Mall / customer service
* Event
* Kampus
* Kantor pelayanan publik
* Workshop / service center
* Dan kebutuhan antrean lainnya

JANGAN membuat sistem dengan asumsi bahwa sistem hanya untuk rumah sakit.

Contoh seperti "Poli Umum", "Poli Anak", dll hanya merupakan contoh jenis layanan. Semua jenis antrean harus dapat dibuat dan dikonfigurasi oleh administrator.

---

# 1. TECH STACK

Gunakan:

* Nuxt 4
* Vue 3
* TypeScript
* Tailwind CSS
* Nuxt UI atau komponen UI modern yang konsisten
* MySQL 8+
* Prisma ORM
* Pinia jika diperlukan
* WebSocket / Socket.IO untuk realtime queue update
* REST API
* Zod atau library validation sejenis
* Day.js untuk date/time
* Chart library seperti ECharts untuk dashboard
* QR Code generator
* QR Code scanner jika diperlukan

Arsitektur harus modular dan scalable.

Gunakan environment variable untuk:

* DATABASE_URL
* APP_URL
* API_BASE_URL
* JWT_SECRET / SESSION_SECRET
* STORAGE configuration
* SMTP configuration
* dan konfigurasi lain yang diperlukan.

---

# 2. KONSEP UTAMA

Sistem memiliki konsep:

Organization
→ Event / Service Session
→ Queue Type / Service
→ Queue Number
→ Visitor
→ Operator
→ Display

Contoh:

Organization:
RS ABC

Event/Session:
Pelayanan 5 September 2026

Queue Types:

A - Poli Umum
B - Poli Anak
C - Poli Gigi

Visitor mengambil:

A001
A002
A003

Operator Poli Umum dapat memanggil:

A001
→ A002
→ A003

Display otomatis berubah secara realtime.

---

# 3. ROLE USER

Buat minimal role:

## A. PUBLIC / VISITOR

Pengunjung tidak perlu login.

Pengunjung masuk melalui QR Code atau public URL.

Contoh:

/p/{publish_code}

atau:

/queue/{publish_code}

Pengunjung dapat:

1. Melihat informasi layanan
2. Mengisi form
3. Memilih jenis antrean
4. Mendapat nomor antrean
5. Melihat status antreannya
6. Melihat nomor yang sedang dipanggil
7. Melihat estimasi posisi antrean jika memungkinkan
8. Memberikan rating/testimoni setelah selesai dilayani

---

# 4. PUBLIC QUEUE REGISTRATION

Admin harus dapat membuat sebuah halaman public yang dapat dipublish.

Contoh:

ANTREAN RS ABC

QR Code:
[QR CODE]

Ketika pengunjung scan QR:

/p/abc123

Muncul halaman:

---

ANTREAN
RS ABC

Silakan ambil nomor antrean

[ Ambil Antrean ]

Jam pelayanan:
08:00 - 16:00

Status:
● BUKA
------

Admin dapat:

* Generate QR Code
* Regenerate QR Code
* Enable / Disable public page
* Custom URL slug
* Custom title
* Custom logo
* Custom background
* Custom warna
* Custom informasi
* Menentukan queue/event yang tersedia

QR Code harus bisa:

* Ditampilkan
* Download PNG
* Download SVG
* Print

---

# 5. DYNAMIC VISITOR FORM

Form pengunjung JANGAN hardcode.

Admin harus dapat membuat form sendiri.

Contoh:

Nama
Asal
Nomor Identitas
Nomor HP
Keperluan
Tanggal Lahir
Alamat
Jenis Layanan

Admin dapat membuat field:

* Text
* Textarea
* Number
* Phone
* Email
* Date
* DateTime
* Select
* Radio
* Checkbox
* File upload
* Hidden field

Setiap field memiliki:

* label
* key
* placeholder
* required
* validation
* default value
* options
* order
* visibility
* help text

Contoh:

{
"name": "Nama Lengkap",
"key": "full_name",
"type": "text",
"required": true
}

---

# 6. EXTERNAL DATA SOURCE / API INTEGRATION

Sistem harus dirancang supaya form dapat mengambil data dari sistem eksternal.

Contoh rumah sakit:

Pengunjung memasukkan nomor pasien.

Sistem dapat query:

GET /api/patient/{medical_record_number}

Kemudian data:

* Nama
* Alamat
* Jenis kelamin
* Tanggal lahir

dapat otomatis terisi.

Admin dapat mengatur:

* API URL
* HTTP method
* Authentication
* Headers
* Request parameter
* Response mapping
* Timeout
* Enable / disable integration

Authentication minimal mendukung:

* API Key
* Bearer Token
* Basic Auth

JANGAN menyimpan secret API secara plain text jika memungkinkan. Gunakan encryption.

Buat abstraction:

DataSource
DataSourceFieldMapping

sehingga ke depan dapat ditambah:

* REST API
* Database query
* JSON endpoint
* webhook

IMPORTANT:

Jangan memberikan kemampuan arbitrary SQL query kepada public user.

Database integration harus menggunakan koneksi/read-only datasource yang aman.

---

# 7. QUEUE TYPE / JENIS ANTREAN

Admin dapat membuat jenis antrean.

Contoh:

A - Poli Umum
B - Poli Anak
C - Poli Gigi

atau:

A - Customer Service
B - Teller
C - Pengaduan

Data queue type minimal:

* code
* name
* description
* prefix
* starting_number
* numbering_format
* color
* icon
* active
* display_order

Contoh nomor:

A001
A002
A003

atau:

UM-001
UM-002

Admin dapat menentukan format nomor.

---

# 8. DAILY QUEUE RESET

Antrean harus menggunakan konsep SERVICE DATE.

Jangan hanya reset counter database.

Contoh:

2026-09-05

A001
A002
A003

Besok:

2026-09-06

A001
A002
A003

Data histori hari sebelumnya tetap tersimpan.

Jadi:

queue_date != created_at

Queue number harus unique berdasarkan:

event/session + queue_type + service_date + sequence

Gunakan database constraint untuk mencegah duplicate queue number.

---

# 9. SERVICE SESSION / EVENT

Buat konsep:

EVENT / SESSION

Contoh:

Event:
Pelayanan Administrasi

Tanggal:
05 September 2026

Jam buka:
08:00

Jam tutup:
16:00

Status:

* DRAFT
* SCHEDULED
* OPEN
* PAUSED
* CLOSED
* COMPLETED

Sistem harus otomatis mengetahui apakah antrean sedang:

OPEN

atau

CLOSED.

Admin dapat melakukan:

* Open queue
* Pause queue
* Resume queue
* Close queue

---

# 10. AUTO CLOSE

Admin dapat mengatur jam operasional.

Contoh:

Senin:
08:00 - 16:00

Selasa:
08:00 - 16:00

Dst.

Saat waktu tutup:

* Public registration ditutup
* Operator tidak dapat mengambil antrean baru
* Display menampilkan status CLOSED
* Existing queue tetap tersimpan

Sediakan opsi:

"Allow operator to finish current queue after closing"

---

# 11. QUEUE STATUS

Setiap queue memiliki status:

* WAITING
* CALLED
* SERVING
* SKIPPED
* COMPLETED
* CANCELLED
* NO_SHOW

Flow normal:

WAITING
→ CALLED
→ SERVING
→ COMPLETED

Jika dilewati:

WAITING
→ SKIPPED

Operator dapat memanggil kembali:

SKIPPED
→ CALLED

---

# 12. OPERATOR

Role operator hanya dapat mengelola antrean yang diberikan kepadanya.

Contoh:

Operator:

Budi

Assignment:

Poli Umum

Budi dapat:

* Melihat antrean Poli Umum
* Next queue
* Recall
* Skip
* Complete
* Memanggil queue tertentu
* Melihat waiting queue
* Melihat skipped queue
* Melihat history

Budi TIDAK dapat:

* Melihat user management
* Mengubah system configuration
* Menghapus queue
* Mengubah queue type
* Mengakses seluruh dashboard superadmin

Kecuali permission diberikan.

---

# 13. OPERATOR DASHBOARD

Buat dashboard operator yang sangat simple dan cepat digunakan.

Layout:

---

POLI UMUM

NOW SERVING

A023

Budi

[ 🔊 PANGGIL ULANG ]

[ NEXT ]

[ SKIP ]

---

WAITING

A024
A025
A026
A027

---

SKIPPED

A019
A021

[ PANGGIL ]

---

HISTORY

A020 COMPLETED
A019 SKIPPED
A018 COMPLETED

Operator dapat memilih queue tertentu untuk dipanggil kembali.

Tambahkan confirmation untuk action penting.

---

# 14. NEXT QUEUE ALGORITHM

Implementasikan transaction-safe queue calling.

Ketika operator klik:

NEXT

sistem harus:

1. Lock candidate queue
2. Ambil queue WAITING paling kecil
3. Ubah status menjadi CALLED/SERVING
4. Simpan waktu call
5. Simpan operator
6. Simpan call history
7. Broadcast event realtime

Jangan sampai dua operator memanggil queue yang sama.

Gunakan database transaction dan row locking / atomic update yang sesuai dengan MySQL.

---

# 15. RECALL

Operator dapat menekan:

RECALL

Nomor yang sedang dipanggil akan dipanggil kembali.

Contoh:

"Nomor antrean A023, silakan menuju Poli Umum."

Simpan:

* recall_count
* last_called_at
* call history

---

# 16. QUEUE HISTORY

Semua aktivitas antrean harus memiliki audit/history.

Contoh:

A023

08:31 created
09:02 called
09:03 recalled
09:05 serving
09:15 completed

Buat tabel:

queue_events

Dengan:

* queue_id
* event_type
* previous_status
* new_status
* operator_id
* metadata
* created_at

---

# 17. GLOBAL DISPLAY

Buat display khusus:

/display/{display_code}

Display keseluruhan menampilkan seluruh jenis antrean.

Contoh:

---

```
          ANTREAN

   Nomor Sedang Dilayani
```

POLI UMUM          POLI ANAK       POLI GIGI

```
A023               B011            C008
```

SILAKAN KE          SILAKAN KE      SILAKAN KE
LOKET 1             LOKET 2         LOKET 3

---

Display harus realtime.

Ketika operator klik NEXT:

A023 → A024

Semua display yang terhubung langsung berubah tanpa refresh.

---

# 18. QUEUE-SPECIFIC DISPLAY

Selain global display, buat display khusus queue type.

Contoh:

/display/{display_code}/queue/{queue_type}

Hanya menampilkan:

POLI UMUM

A023

Silakan menuju Poli Umum

Display ini dapat digunakan di monitor khusus ruang Poli Umum.

---

# 19. DISPLAY BUILDER

Ini merupakan fitur penting.

Admin dapat membuat layout display tanpa coding.

Buat konsep:

DISPLAY TEMPLATE

Admin dapat memilih:

* Global display
* Queue display

Kemudian mengatur:

* Background
* Logo
* Header
* Footer
* Clock
* Current queue
* Queue list
* Video
* Image
* Text
* Announcement
* Running text
* QR Code
* HTML widget jika diperlukan dengan security restriction

Gunakan konsep component/widget.

Contoh:

Widget:

Current Queue
Waiting Queue
Clock
Logo
Image
Video
Text
Announcement
Date
Organization Name

Setiap widget memiliki:

* x
* y
* width
* height
* z-index
* font size
* alignment
* animation
* visibility

Buat display editor menggunakan drag & drop jika memungkinkan.

---

# 20. DISPLAY MEDIA

Admin dapat upload:

* JPG
* PNG
* WEBP
* MP4

Media dapat digunakan pada display.

Buat media library.

Media memiliki:

* name
* type
* file_path
* duration
* active

Admin dapat membuat playlist.

Contoh:

Logo
→ Image
→ Video
→ Advertisement
→ Announcement

---

# 21. DISPLAY ANNOUNCEMENT

Operator ketika memanggil queue harus mengirim event:

QUEUE_CALLED

Payload:

{
queueNumber: "A023",
queueType: "Poli Umum",
counter: "Loket 1",
operator: "Budi"
}

Display menerima event tersebut.

Kemudian:

1. Update current queue
2. Highlight queue
3. Jalankan animation
4. Play sound
5. Optional text-to-speech

Contoh suara:

"Nomor antrean A023, silakan menuju Poli Umum."

---

# 22. AUDIO

Admin dapat mengatur:

* Enable / disable voice
* Language
* Voice
* Number pronunciation
* Repeat count
* Volume

Gunakan browser Web Speech API sebagai default.

Jangan membuat audio file untuk setiap nomor.

---

# 23. TESTIMONIAL & RATING

Setelah pengunjung selesai dilayani:

Tampilkan:

Bagaimana pengalaman Anda?

★★★★★

1 - Sangat Buruk
2 - Buruk
3 - Cukup
4 - Baik
5 - Sangat Baik

Optional:

Komentar

Data testimonial dapat memiliki:

* rating
* comment
* queue_id
* visitor_id
* created_at
* approved

Admin dapat:

* Approve
* Hide
* Delete
* Filter
* Export

---

# 24. ADMIN DASHBOARD

Dashboard superadmin harus modern.

Tampilkan:

TODAY

Total Visitor
1,254

Total Queue
1,180

Completed
1,030

Waiting
95

Skipped
25

Cancelled
30

Average Waiting Time
12m

Average Service Time
8m

Customer Satisfaction
4.6 / 5

---

# 25. DASHBOARD CHART

Tambahkan:

* Queue volume by hour
* Queue by service type
* Completed vs waiting
* Average waiting time
* Average service time
* Operator performance
* Satisfaction rating
* Daily trend
* Weekly trend
* Monthly trend

Filter:

* Date
* Event
* Queue Type
* Operator

---

# 26. SUPERADMIN

Superadmin dapat mengelola seluruh sistem.

Menu:

Dashboard

├── Overview
├── Analytics
└── Reports

Queue

├── Live Queue
├── Queue Types
├── Queue History
└── Queue Settings

Visitors

├── Visitor List
├── Visitor Detail
└── Feedback

Operators

├── Operator Users
├── Roles
├── Permissions
└── Assignments

Display

├── Displays
├── Display Templates
├── Display Builder
└── Media Library

Event / Session

├── Events
├── Schedule
└── Service Hours

Public

├── Published Pages
├── QR Codes
└── Public Form Builder

Integration

├── API Data Sources
├── Database Sources
└── Webhooks

Reports

├── Daily Report
├── Queue Report
├── Operator Report
└── Export

System

├── Settings
├── Audit Logs
└── Backup / Maintenance

---

# 27. PUBLISH SYSTEM

Admin dapat membuat public endpoint.

Contoh:

Publish:

"RS ABC - Pelayanan Umum"

URL:

/p/rs-abc-2026

QR Code diarahkan ke URL tersebut.

Status:

PUBLISHED / UNPUBLISHED

Admin dapat:

* Publish
* Unpublish
* Regenerate QR
* Preview
* Copy URL
* Download QR

---

# 28. MULTI EVENT

Sistem harus mendukung banyak event/session.

Contoh:

Event 1:
Pelayanan Rumah Sakit

Event 2:
Festival AHU

Event 3:
Pelayanan Dukcapil

Masing-masing event dapat memiliki:

* Queue Type berbeda
* Form berbeda
* Display berbeda
* Operator berbeda
* Public URL berbeda
* Branding berbeda

Jangan mencampur data antar event.

---

# 29. MULTI ORGANIZATION READY

Walaupun implementasi awal mungkin hanya digunakan satu organisasi, struktur database harus disiapkan agar suatu saat mendukung multi-tenant.

Gunakan:

organization_id

pada entity yang relevan.

---

# 30. DATABASE DESIGN

Gunakan Prisma schema.

Minimal tabel:

organizations

users

roles

permissions

role_permissions

user_roles

events

event_schedules

queue_types

queue_counters

queues

queue_events

operator_assignments

visitors

visitor_field_values

form_definitions

form_fields

data_sources

data_source_mappings

public_pages

qr_codes

display_devices

display_templates

display_widgets

media

playlists

announcements

testimonials

audit_logs

system_settings

notifications

---

# 31. IMPORTANT DATABASE RULES

Gunakan:

UUID atau ULID sebagai primary key.

Jangan menggunakan integer ID sebagai public identifier.

Tambahkan:

created_at
updated_at

untuk hampir seluruh tabel.

Gunakan soft delete untuk data penting:

deleted_at

Tambahkan index pada field yang sering digunakan.

Contoh:

queues:

INDEX(event_id)
INDEX(queue_type_id)
INDEX(service_date)
INDEX(status)
INDEX(operator_id)
INDEX(created_at)

Composite index:

(event_id, queue_type_id, service_date, sequence_number)

Unique:

(event_id, queue_type_id, service_date, sequence_number)

---

# 32. QUEUE NUMBER DATABASE DESIGN

Jangan menggunakan:

MAX(sequence) + 1

karena rawan race condition.

Gunakan tabel:

queue_counters

Contoh:

id
event_id
queue_type_id
service_date
current_number
created_at
updated_at

Unique:

(event_id, queue_type_id, service_date)

Generate nomor menggunakan transaction.

---

# 33. DATABASE RELATIONSHIP

Relasi utama:

Organization
↓
Event
↓
QueueType
↓
Queue

Visitor
↓
Queue

User
↓
OperatorAssignment
↓
QueueType

Queue
↓
QueueEvent

Display
↓
DisplayTemplate
↓
DisplayWidget

Event
↓
PublicPage
↓
QRCode

---

# 34. API DESIGN

Buat REST API yang terstruktur.

PUBLIC:

POST /api/public/{publishCode}/queue

GET /api/public/{publishCode}

GET /api/public/{publishCode}/queue/{queueId}

GET /api/public/{publishCode}/status

OPERATOR:

GET /api/operator/queues

POST /api/operator/queue/next

POST /api/operator/queue/{id}/recall

POST /api/operator/queue/{id}/skip

POST /api/operator/queue/{id}/complete

ADMIN:

GET /api/admin/dashboard

GET /api/admin/queues

GET /api/admin/visitors

POST /api/admin/queue-types

POST /api/admin/operators

POST /api/admin/displays

POST /api/admin/forms

POST /api/admin/events

---

# 35. REALTIME ARCHITECTURE

Gunakan WebSocket / Socket.IO.

Events:

queue.created

queue.called

queue.recalled

queue.skipped

queue.completed

queue.cancelled

queue.updated

display.updated

announcement.created

event.opened

event.closed

Ketika operator melakukan NEXT:

Operator
→ API
→ Database transaction
→ WebSocket broadcast
→ All relevant displays

Display tidak boleh polling terus-menerus jika realtime WebSocket tersedia.

Gunakan polling sebagai fallback.

---

# 36. SECURITY

Implementasikan:

* Authentication
* Authorization
* RBAC
* CSRF protection sesuai arsitektur
* Rate limiting
* Input validation
* File upload validation
* MIME validation
* File size limitation
* API credential encryption
* Audit log
* SQL injection protection
* XSS protection
* Secure headers
* Session security

Public queue registration harus memiliki rate limiting agar tidak mudah diserang spam.

Tambahkan CAPTCHA atau mekanisme anti-bot yang dapat diaktifkan dari admin jika diperlukan.

---

# 37. AUDIT LOG

Semua aktivitas penting harus dicatat.

Contoh:

USER_LOGIN

QUEUE_CREATED

QUEUE_CALLED

QUEUE_SKIPPED

QUEUE_RECALLED

QUEUE_COMPLETED

USER_CREATED

USER_UPDATED

DISPLAY_UPDATED

EVENT_OPENED

EVENT_CLOSED

SETTING_CHANGED

Simpan:

* user
* action
* entity
* entity_id
* old_data
* new_data
* IP
* user_agent
* timestamp

---

# 38. EXPORT CENTER

Admin dapat export:

Visitor

Queue

Queue History

Operator Performance

Feedback

Daily Report

Format:

CSV
Excel
PDF jika diperlukan

Export harus menggunakan background job jika datanya besar.

---

# 39. REPORT

Buat laporan:

Daily Queue Report

Contoh:

Tanggal:
05 September 2026

Total Visitor:
1,254

Total Queue:
1,180

Completed:
1,030

Skipped:
25

Cancelled:
30

Average Waiting:
12 menit

Average Service:
8 menit

Satisfaction:
4.6

---

# 40. RESPONSIVE DESIGN

Public page harus sangat mobile friendly.

Target:

Mobile-first.

Operator dashboard:

Desktop + tablet.

Display:

Landscape 16:9.

Admin:

Desktop + tablet.

---

# 41. UI / UX

Design harus terlihat seperti SaaS modern.

Gunakan:

* Clean dashboard
* Card
* Chart
* Sidebar
* Topbar
* Modal
* Drawer
* Toast
* Skeleton loading
* Empty state
* Confirmation dialog

Jangan membuat UI terlalu ramai.

Gunakan typography yang jelas.

Status menggunakan badge.

Contoh:

WAITING
CALLED
SERVING
COMPLETED
SKIPPED
CANCELLED

---

# 42. PUBLIC QUEUE SCREEN

Setelah visitor mengambil antrean, tampilkan:

---

ANTREAN ANDA

A023

Poli Umum

Status:
MENUNGGU

Saat ini:
A019

Di depan Anda:
3 orang

Perkiraan waktu:
± 15 menit

---

[ 🔄 Refresh ]

QR Code untuk cek antrean

---

Jika queue dipanggil:

🔔

NOMOR ANDA DIPANGGIL

A023

Silakan menuju:

POLI UMUM

LOKET 1

---

Gunakan realtime WebSocket.

---

# 43. QUEUE TRACKING

Visitor tidak perlu login.

Gunakan secure public token.

Contoh:

/queue/status/{secure_token}

Jangan expose database ID.

Token harus random dan tidak mudah ditebak.

---

# 44. DISPLAY OFFLINE HANDLING

Display harus memiliki indikator:

ONLINE

OFFLINE

LAST UPDATE

Jika WebSocket terputus:

* reconnect otomatis
* exponential backoff
* fallback polling
* tampilkan status koneksi

---

# 45. DISPLAY DEVICE REGISTRATION

Admin dapat membuat display device.

Contoh:

DISPLAY-001

Nama:
Lobby Utama

Type:

GLOBAL

Assigned Event:

Pelayanan 2026

Assigned Template:

Lobby Template

Display memiliki:

device_code
device_token
last_seen_at
status

Saat browser dibuka:

/display/connect/{device_code}

display melakukan pairing dengan server.

---

# 46. PRINT TICKET

Siapkan architecture agar nanti bisa support thermal printer.

Ticket:

---

```
    ANTREAN

       A023

    POLI UMUM

   05 SEP 2026
```

Silakan menunggu

## Saat ini: A019

Implementasi awal boleh menggunakan browser print.

---

# 47. NOTIFICATION ARCHITECTURE

Siapkan abstraction:

NotificationService

yang nantinya dapat mendukung:

* Display
* Browser notification
* Email
* WhatsApp
* SMS

Implementasi awal fokus pada display + browser.

---

# 48. CONFIGURABLE BRANDING

Setiap event/public page dapat memiliki:

* Logo
* Primary color
* Secondary color
* Background
* Font
* Organization name
* Footer
* Custom CSS variables

Jangan hardcode branding.

---

# 49. SYSTEM SETTINGS

Admin dapat mengatur:

* Default queue number length
* Default queue prefix
* Auto close
* Auto reset
* Voice announcement
* Recall limit
* Maximum waiting queue
* Public registration
* Rating
* Display timeout
* Session duration
* Timezone

Default timezone:

Asia/Jakarta

Tetapi harus configurable.

---

# 50. IMPORTANT: TIMEZONE

Database gunakan UTC jika architecture memungkinkan.

Frontend menampilkan timezone berdasarkan configuration.

Default:

Asia/Jakarta

Service date harus dihitung berdasarkan timezone event, bukan timezone server.

---

# 51. SEED DATA

Buat Prisma seed.

Seed:

Organization:

"Demo Organization"

Event:

"Demo Service"

Queue Types:

A - Pelayanan Umum
B - Pelayanan Khusus
C - Informasi

Users:

superadmin
operator1
operator2

Password hanya untuk development dan wajib diberi warning agar diganti.

---

# 52. INITIAL ADMIN

Buat halaman login:

/login

Setelah login:

/admin/dashboard

Role redirect:

SUPERADMIN
→ /admin/dashboard

OPERATOR
→ /operator

---

# 53. ROUTE STRUCTURE

Gunakan struktur:

/

/login

/p/[publishCode]

/queue/[token]

/display/[displayCode]

/operator

/operator/queue

/admin

/admin/dashboard

/admin/events

/admin/queue-types

/admin/visitors

/admin/operators

/admin/forms

/admin/displays

/admin/display-builder

/admin/media

/admin/reports

/admin/integrations

/admin/settings

---

# 54. DEVELOPMENT REQUIREMENTS

Jangan langsung membuat semua fitur secara acak.

Implementasikan secara bertahap:

PHASE 1

* Nuxt setup
* MySQL
* Prisma
* Authentication
* RBAC
* Organization
* Event
* Queue Type

PHASE 2

* Public registration
* Dynamic form
* Queue generation
* Daily reset
* Queue status

PHASE 3

* Operator dashboard
* Next
* Recall
* Skip
* Complete
* Queue history

PHASE 4

* WebSocket
* Global display
* Queue display
* Voice announcement

PHASE 5

* Display builder
* Media
* Playlist

PHASE 6

* Dashboard
* Analytics
* Reports
* Export

PHASE 7

* Testimonial
* API integration
* Data source
* Advanced configuration

---

# 55. CODE QUALITY

Gunakan:

* TypeScript strict mode
* Modular architecture
* Reusable components
* Composables
* Services
* Repository pattern jika diperlukan
* DTO/schema validation
* Centralized error handling
* Centralized API response format
* Logging
* Environment configuration

Jangan menaruh business logic terlalu banyak di Vue component.

Pisahkan:

UI
→ composable
→ service
→ repository
→ database

---

# 56. ERROR HANDLING

API response standard:

{
"success": false,
"message": "Queue is already called",
"code": "QUEUE_ALREADY_CALLED",
"data": null
}

Success:

{
"success": true,
"message": "Queue called successfully",
"data": {}
}

---

# 57. IMPORTANT QUEUE BUSINESS RULES

1. Queue number reset setiap service date.
2. Histori tidak boleh terhapus ketika nomor reset.
3. Queue number harus unique.
4. Dua operator tidak boleh mendapatkan queue yang sama.
5. Operator hanya dapat mengakses assignment-nya.
6. Superadmin dapat mengakses seluruh queue.
7. Queue yang SKIPPED dapat dipanggil kembali.
8. Queue COMPLETED tidak boleh dipanggil kembali kecuali melalui fitur khusus admin.
9. Queue CANCELLED tidak dapat dipanggil.
10. Queue harus selalu memiliki service_date.
11. Event CLOSED tidak menerima visitor baru.
12. Public page dapat dinonaktifkan tanpa menghapus data.
13. Delete queue sebaiknya tidak diperbolehkan secara normal; gunakan cancel/soft delete.
14. Semua perubahan penting dicatat dalam audit log.

---

# 58. IMPROVEMENT YANG DIHARAPKAN

Jangan hanya mengikuti requirement di atas secara literal.

Jika menemukan desain yang lebih baik, implementasikan improvement selama tidak menghilangkan requirement.

Prioritaskan:

* scalability
* security
* realtime performance
* maintainability
* database consistency
* UX
* configurable architecture

Sistem harus terasa seperti produk profesional yang bisa dijual ke banyak organisasi.

---

# 59. ACCEPTANCE CRITERIA

Sistem dianggap berhasil jika:

1. Admin dapat membuat Event.
2. Admin dapat membuat Queue Type.
3. Admin dapat membuat Operator.
4. Admin dapat assign Operator ke Queue Type.
5. Admin dapat membuat Dynamic Form.
6. Admin dapat publish Public Page.
7. Public Page memiliki QR Code.
8. Visitor dapat scan QR dan mengambil antrean.
9. Sistem menghasilkan nomor antrean.
10. Nomor reset berdasarkan service date.
11. Operator dapat NEXT.
12. Operator dapat RECALL.
13. Operator dapat SKIP.
14. Operator dapat COMPLETE.
15. Operator dapat memanggil queue yang SKIPPED.
16. Global Display berubah realtime.
17. Queue-specific Display berubah realtime.
18. Display dapat memutar audio announcement.
19. Admin dapat mengatur layout display.
20. Admin dapat upload image/video.
21. Admin dapat melihat seluruh visitor.
22. Admin dapat melihat queue history.
23. Admin dapat melihat dashboard analytics.
24. Admin dapat melihat rating/testimonial.
25. Admin dapat export data.
26. Semua action penting tercatat di audit log.
27. Tidak terjadi duplicate queue number.
28. Tidak terjadi double calling akibat race condition.
29. Public API memiliki rate limiting.
30. Sistem dapat digunakan untuk berbagai skenario selain rumah sakit.

---

# 60. OUTPUT YANG DIHARAPKAN DARI CODING AGENT

Jangan hanya memberikan contoh kode.

Bangun aplikasi yang benar-benar runnable.

Output:

1. Source code lengkap.
2. Prisma schema.
3. Migration.
4. Seed.
5. Environment example.
6. README installation.
7. Database setup.
8. API documentation.
9. WebSocket documentation.
10. Demo account.
11. Test cases untuk queue concurrency.
12. Test cases untuk daily reset.
13. Test cases untuk operator authorization.
14. Test cases untuk public queue registration.

Pastikan:

npm install
npm run dev

dapat menjalankan aplikasi setelah database dikonfigurasi.

Gunakan nama project:

**ANTREAN**

Tagline:

**"Kelola Antrean. Layani Lebih Cepat."**

Buat UI dengan kualitas production-ready, bukan sekadar prototype.


pakai database localhost 3306 dengan database nama antrean dan user password nya myantrean / myantrean123