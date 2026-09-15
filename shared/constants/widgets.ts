/**
 * Katalog widget display (§19).
 * Dipakai bersama oleh builder (palet & panel properti) dan renderer.
 */
export const WIDGET_TYPES = [
  'CURRENT_QUEUE',
  'COUNTER_BOARD',
  'VISITOR_INFO',
  'QUEUE_LIST',
  'CLOCK',
  'DATE',
  'LOGO',
  'IMAGE',
  'VIDEO',
  'TEXT',
  'RUNNING_TEXT',
  'ANNOUNCEMENT',
  'ORG_NAME',
  'QRCODE',
  'PLAYLIST',
] as const

export type WidgetType = (typeof WIDGET_TYPES)[number]

export interface WidgetMeta {
  type: WidgetType
  label: string
  icon: string
  description: string
  /** ukuran awal saat dijatuhkan ke kanvas 1920×1080 */
  defaultSize: { width: number, height: number }
  needsMedia?: boolean
  needsPlaylist?: boolean
  needsQueueType?: boolean
  /** Butuh daftar field formulir (dari Form Builder) pada panel properti. */
  needsFormFields?: boolean
}

/** Satu isian formulir yang dipilih admin untuk ditampilkan di layar. */
export interface WidgetField {
  /** Kunci field pada Form Builder — dipakai mencocokkan data pengunjung. */
  key: string
  /** Label disalin saat dipilih, supaya layar tidak perlu memuat formulirnya. */
  label: string
}

export const WIDGET_CATALOG: WidgetMeta[] = [
  {
    type: 'CURRENT_QUEUE',
    label: 'Nomor Dilayani',
    icon: 'i-lucide-megaphone',
    description: 'Nomor yang sedang dipanggil beserta loketnya',
    defaultSize: { width: 600, height: 420 },
    needsQueueType: true,
  },
  {
    type: 'COUNTER_BOARD',
    label: 'Nomor per Loket',
    icon: 'i-lucide-layout-grid',
    description: 'Satu kotak untuk tiap loket beserta nomor yang sedang dilayaninya',
    defaultSize: { width: 1400, height: 380 },
    needsQueueType: true,
  },
  {
    type: 'VISITOR_INFO',
    label: 'Data Pengunjung',
    icon: 'i-lucide-user-round',
    description: 'Nomor antrean beserta isian formulir pengunjungnya (mis. nama)',
    defaultSize: { width: 900, height: 280 },
    needsQueueType: true,
    needsFormFields: true,
  },
  {
    type: 'QUEUE_LIST',
    label: 'Daftar Menunggu',
    icon: 'i-lucide-list-ordered',
    description: 'Beberapa nomor berikutnya pada satu layanan',
    defaultSize: { width: 460, height: 420 },
    needsQueueType: true,
  },
  { type: 'CLOCK', label: 'Jam', icon: 'i-lucide-clock', description: 'Jam berjalan', defaultSize: { width: 380, height: 140 } },
  { type: 'DATE', label: 'Tanggal', icon: 'i-lucide-calendar', description: 'Tanggal hari ini', defaultSize: { width: 420, height: 90 } },
  { type: 'ORG_NAME', label: 'Nama Instansi', icon: 'i-lucide-building', description: 'Nama organisasi atau event', defaultSize: { width: 700, height: 100 } },
  { type: 'LOGO', label: 'Logo', icon: 'i-lucide-image', description: 'Logo instansi dari media library', defaultSize: { width: 220, height: 220 }, needsMedia: true },
  { type: 'IMAGE', label: 'Gambar', icon: 'i-lucide-image', description: 'Gambar dari media library', defaultSize: { width: 600, height: 340 }, needsMedia: true },
  { type: 'VIDEO', label: 'Video', icon: 'i-lucide-video', description: 'Video berulang tanpa suara', defaultSize: { width: 700, height: 400 }, needsMedia: true },
  { type: 'PLAYLIST', label: 'Playlist', icon: 'i-lucide-gallery-horizontal', description: 'Gambar & video bergilir', defaultSize: { width: 700, height: 400 }, needsPlaylist: true },
  { type: 'TEXT', label: 'Teks', icon: 'i-lucide-type', description: 'Teks bebas', defaultSize: { width: 500, height: 120 } },
  { type: 'RUNNING_TEXT', label: 'Teks Berjalan', icon: 'i-lucide-scroll-text', description: 'Teks bergerak dari kanan ke kiri', defaultSize: { width: 1920, height: 90 } },
  { type: 'ANNOUNCEMENT', label: 'Pengumuman', icon: 'i-lucide-bell-ring', description: 'Pengumuman aktif dari admin', defaultSize: { width: 1920, height: 90 } },
  { type: 'QRCODE', label: 'QR Code', icon: 'i-lucide-qr-code', description: 'QR halaman ambil antrean', defaultSize: { width: 260, height: 300 } },
]

export const WIDGET_META = Object.fromEntries(
  WIDGET_CATALOG.map(w => [w.type, w]),
) as Record<WidgetType, WidgetMeta>

/** Konfigurasi bawaan tiap widget saat baru ditambahkan. */
export function defaultWidgetConfig(type: WidgetType): Record<string, unknown> {
  switch (type) {
    case 'TEXT':
      return { text: 'Teks baru' }
    case 'RUNNING_TEXT':
      return { text: 'Selamat datang di layanan kami' }
    case 'CLOCK':
      return { showSeconds: true }
    case 'QUEUE_LIST':
      return { limit: 5 }
    case 'CURRENT_QUEUE':
      return { showCounter: true, showQueueTypeName: true }
    case 'COUNTER_BOARD':
      /** `columns: 0` berarti mengikuti jumlah loket (maksimal 4 per baris). */
      return { columns: 0, showEmpty: true, showService: true }
    case 'VISITOR_INFO':
      /**
       * `fields` sengaja kosong: tidak ada isian formulir yang tampil di layar
       * sebelum admin memilihnya sendiri. Data pengunjung bisa berisi nomor HP
       * atau nomor identitas, jadi menampilkannya harus keputusan yang disengaja.
       */
      return { fields: [], showQueueNumber: true, showLabel: true, mask: false }
    case 'VIDEO':
      return { loop: true, muted: true }
    default:
      return {}
  }
}

export interface WidgetStyle {
  color?: string
  backgroundColor?: string
  fontSize?: number
  fontWeight?: number
  align?: 'left' | 'center' | 'right'
  radius?: number
  padding?: number
  opacity?: number
  objectFit?: 'cover' | 'contain'
}

export function defaultWidgetStyle(type: WidgetType): WidgetStyle {
  const base: WidgetStyle = { align: 'center', radius: 16, padding: 16, opacity: 1 }

  switch (type) {
    case 'CURRENT_QUEUE':
      return { ...base, backgroundColor: '#0f172a', color: '#ffffff', fontSize: 160, fontWeight: 800 }
    case 'COUNTER_BOARD':
      return { ...base, backgroundColor: '#0f172a', color: '#ffffff', fontSize: 96, fontWeight: 800 }
    case 'VISITOR_INFO':
      return { ...base, backgroundColor: '#0f172a', color: '#ffffff', fontSize: 88, fontWeight: 800 }
    case 'QUEUE_LIST':
      return { ...base, backgroundColor: '#0f172a', color: '#e2e8f0', fontSize: 44, fontWeight: 700 }
    case 'CLOCK':
      return { ...base, color: '#ffffff', fontSize: 72, fontWeight: 700 }
    case 'DATE':
      return { ...base, color: '#cbd5e1', fontSize: 32, fontWeight: 500 }
    case 'ORG_NAME':
      return { ...base, color: '#ffffff', fontSize: 48, fontWeight: 800 }
    case 'TEXT':
      return { ...base, color: '#ffffff', fontSize: 36, fontWeight: 600 }
    case 'RUNNING_TEXT':
    case 'ANNOUNCEMENT':
      return { ...base, backgroundColor: '#1e293b', color: '#e2e8f0', fontSize: 34, fontWeight: 500, align: 'left' }
    case 'IMAGE':
    case 'VIDEO':
    case 'PLAYLIST':
      return { ...base, padding: 0, objectFit: 'cover' }
    case 'LOGO':
      return { ...base, padding: 0, objectFit: 'contain' }
    default:
      return base
  }
}

/** Kanvas acuan; renderer menskalakan seluruh isinya ke ukuran layar sebenarnya. */
export const CANVAS = { width: 1920, height: 1080 }
