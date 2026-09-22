/**
 * Dua bentuk QR untuk satu halaman publik.
 *
 * DINAMIS memakai kode publikasi (`/p/47cnne2n`). Kodenya bisa diputar lewat
 * "Ganti tautan & QR", dan begitu diputar semua cetakan lama mati — itu gunanya:
 * QR yang tersebar di luar kendali bisa dicabut tanpa menyentuh halamannya.
 *
 * STATIS memakai slug (`/p/khusus-atensi`). Tautannya tetap selama slugnya tidak
 * diubah, jadi inilah yang dipakai untuk apa pun yang mahal dicetak ulang —
 * papan akrilik di lobi, spanduk, atau brosur.
 *
 * Halaman tanpa slug hanya punya yang dinamis; pilihan statisnya dimatikan di
 * antarmuka alih-alih menghasilkan QR yang mengarah ke alamat yang tidak ada.
 */
export const QR_VARIANTS = ['dynamic', 'static'] as const

export type QrVariant = (typeof QR_VARIANTS)[number]

export const QR_VARIANT_OPTIONS: Array<{ label: string, value: QrVariant }> = [
  { label: 'QR dinamis — kode publikasi', value: 'dynamic' },
  { label: 'QR statis — tautan slug', value: 'static' },
]

/** Bentuk QR yang sah; apa pun selain 'static' dianggap dinamis. */
export function parseQrVariant(raw: unknown): QrVariant {
  return raw === 'static' ? 'static' : 'dynamic'
}

/**
 * Paket warna siap pakai untuk halaman publik.
 *
 * Memilih tiga warna yang serasi bukan pekerjaan yang wajar dibebankan ke petugas
 * yang sedang menyiapkan antrean. Paket ini menyelesaikan kasus yang paling sering
 * muncul dengan sekali klik, dan tetap bisa diubah satu per satu sesudahnya —
 * memilih paket hanya mengisi ketiga kolom warna, bukan menguncinya.
 */
export interface BrandingPreset {
  key: string
  label: string
  description: string
  primary: string
  secondary: string
  accent: string
}

export const BRANDING_PRESETS: BrandingPreset[] = [
  {
    key: 'professional-blue',
    label: 'Biru Profesional',
    description: 'Bawaan Sistem Antrean AHU — tenang dan mudah dibaca.',
    primary: '#132b48',
    secondary: '#0f172a',
    accent: '#2d5892',
  },
  {
    key: 'government',
    label: 'Instansi',
    description: 'Biru tua dengan aksen emas, lazim untuk layanan pemerintahan.',
    primary: '#14306b',
    secondary: '#0b1c3d',
    accent: '#c8952a',
  },
  {
    key: 'corporate',
    label: 'Korporat',
    description: 'Nada gelap netral dengan aksen biru langit.',
    primary: '#0f172a',
    secondary: '#1e293b',
    accent: '#0ea5e9',
  },
  {
    key: 'minimal',
    label: 'Minimal',
    description: 'Abu-abu tanpa warna mencolok; menonjolkan isi halaman.',
    primary: '#111827',
    secondary: '#374151',
    accent: '#6b7280',
  },
  {
    key: 'dark',
    label: 'Gelap',
    description: 'Latar hampir hitam dengan aksen biru terang.',
    primary: '#0b1220',
    secondary: '#020617',
    accent: '#38bdf8',
  },
  {
    key: 'elegant',
    label: 'Elegan',
    description: 'Ungu tua yang lembut untuk layanan premium.',
    primary: '#4c1d95',
    secondary: '#1e1b4b',
    accent: '#a78bfa',
  },
  {
    key: 'event',
    label: 'Event',
    description: 'Hangat dan ramai, cocok untuk pameran atau festival.',
    primary: '#be185d',
    secondary: '#831843',
    accent: '#f59e0b',
  },
]

/** Paket yang sedang terpakai, bila ketiga warnanya persis sama. */
export function matchPreset(primary: string, secondary: string, accent: string): string {
  const sama = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  return BRANDING_PRESETS.find(p =>
    sama(p.primary, primary) && sama(p.secondary, secondary) && sama(p.accent, accent),
  )?.key ?? 'custom'
}
