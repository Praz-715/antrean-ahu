import { z } from 'zod'
import { hexColorSchema } from './common'

/**
 * Tampilan halaman publik (§48).
 *
 * Seluruhnya disimpan pada kolom `public_pages.theme` yang memang sudah ada — bukan
 * belasan kolom baru. Bedanya dengan sebelumnya: isinya kini divalidasi skema ini,
 * jadi bukan lagi JSON bebas. Apa pun yang tidak dikenal ditolak di API, dan nilai
 * yang hilang diisi bawaan lewat `parsePublicPageTheme`.
 *
 * Semua kunci opsional dengan nilai bawaan, sehingga baris lama yang hanya berisi
 * `{ primaryColor, secondaryColor, footerText }` tetap terbaca apa adanya — itulah
 * syarat utamanya: halaman yang sudah terbit tidak boleh berubah tampilannya hanya
 * karena pembaruan ini.
 */

/** Tinggi hero; angkanya ditentukan komponen, bukan disimpan sebagai piksel. */
export const HERO_HEIGHTS = ['compact', 'medium', 'large'] as const
export const HERO_ALIGNS = ['left', 'center', 'right'] as const
export const SERVICE_CARD_STYLES = ['elevated', 'outlined', 'soft'] as const
export const SERVICE_CTA_STYLES = ['button', 'link'] as const

/**
 * Penanda pada kartu layanan halaman publik.
 *
 * `code` menampilkan kode layanan ("A", "B"), `icon` memakai ikon Lucide yang
 * disetel pada jenis antrean, dan `logo` memakai berkas dari Media Library.
 *
 * Dua yang terakhir JATUH KEMBALI ke kode bila sumbernya belum disetel pada jenis
 * antrean itu. Kotak kosong tidak memberi tahu pengunjung apa pun, sementara kode
 * selalu ada — dan kode itulah yang ia cocokkan dengan nomor antreannya.
 */
export const SERVICE_BADGE_STYLES = ['code', 'icon', 'logo'] as const
export type ServiceBadgeStyle = (typeof SERVICE_BADGE_STYLES)[number]

export const SERVICE_BADGE_OPTIONS: Array<{ label: string, value: ServiceBadgeStyle }> = [
  { label: 'Kode layanan (A, B, C)', value: 'code' },
  { label: 'Ikon jenis antrean', value: 'icon' },
  { label: 'Logo dari Media Library', value: 'logo' },
]
export const INFO_STYLES = ['cards', 'plain'] as const

const heroSchema = z.object({
  enabled: z.boolean().default(true),
  /** Kosong berarti memakai judul halaman — admin tidak perlu menulis dua kali. */
  title: z.string().trim().max(150).default(''),
  subtitle: z.string().trim().max(190).default(''),
  description: z.string().trim().max(500).default(''),
  align: z.enum(HERO_ALIGNS).default('center'),
  height: z.enum(HERO_HEIGHTS).default('medium'),
  /** Kepekatan lapisan warna di atas gambar latar, dalam persen. */
  overlay: z.number().int().min(0).max(100).default(72),
  ctaEnabled: z.boolean().default(true),
  ctaText: z.string().trim().max(60).default('Ambil Nomor Antrean'),
  showDate: z.boolean().default(true),
  showTime: z.boolean().default(true),
  showLocation: z.boolean().default(false),
  location: z.string().trim().max(190).default(''),
}).prefault({})

const servicesSchema = z.object({
  title: z.string().trim().max(120).default('Pilih layanan'),
  subtitle: z.string().trim().max(190).default(''),
  /** Jumlah kolom pada layar lebar; sempit selalu turun jadi satu kolom. */
  columns: z.number().int().min(2).max(4).default(3),
  cardStyle: z.enum(SERVICE_CARD_STYLES).default('elevated'),
  /**
   * Penanda kartu: kode layanan, ikon, atau logo dari Media Library.
   *
   * Menggantikan `showIcon` yang lama. Satu pilihan bertiga, bukan satu sakelar
   * ditambah urutan prioritas tersembunyi: dengan sakelar, admin yang menyetel
   * ikon DAN logo tidak punya cara memberi tahu mana yang ia maksud.
   */
  badgeStyle: z.enum(SERVICE_BADGE_STYLES).default('code'),
  showWaiting: z.boolean().default(true),
  showEstimate: z.boolean().default(true),
  ctaStyle: z.enum(SERVICE_CTA_STYLES).default('button'),
}).prefault({})

const infoSchema = z.object({
  title: z.string().trim().max(120).default('Informasi layanan'),
  /**
   * `cards` memecah tiap baris `infoHtml` menjadi kartu sendiri. Teks panjang dalam
   * satu blok kuning nyaris tidak terbaca di ponsel; sebagai daftar kartu, tiap
   * syarat berdiri sendiri dan bisa dipindai sekilas.
   */
  style: z.enum(INFO_STYLES).default('cards'),
}).prefault({})

const footerSchema = z.object({
  showLogo: z.boolean().default(true),
  showOrganization: z.boolean().default(true),
  showPoweredBy: z.boolean().default(true),
}).prefault({})

export const publicPageThemeSchema = z.object({
  /* --- kunci lama; sudah dipakai baris yang tersimpan hari ini --- */
  primaryColor: hexColorSchema.default('#132b48'),
  secondaryColor: hexColorSchema.default('#0f172a'),
  /** Warna aksen; kosong berarti mengikuti warna utama. */
  accentColor: hexColorSchema.optional(),
  fontFamily: z.string().trim().max(120).default(''),
  footerText: z.string().trim().max(190).default(''),

  /* --- bagian halaman --- */
  hero: heroSchema,
  services: servicesSchema,
  info: infoSchema,
  footer: footerSchema,
})

export type PublicPageTheme = z.infer<typeof publicPageThemeSchema>

/**
 * Membaca tema tersimpan menjadi objek yang seluruh kuncinya pasti ada.
 *
 * Dipakai server (saat menyajikan halaman) dan klien (pratinjau builder), sehingga
 * keduanya berangkat dari nilai bawaan yang sama persis. Isi yang rusak — misalnya
 * warna yang bukan heksadesimal karena disunting langsung di database — tidak
 * menjatuhkan halaman; yang dipakai nilai bawaannya.
 */
/**
 * Terjemahkan setelan lama `services.showIcon` menjadi `services.badgeStyle`.
 *
 * Halaman yang sudah terbit menyimpan `showIcon` dan tidak mengenal
 * `badgeStyle`; tanpa penerjemahan ini halaman yang sengaja dimatikan ikonnya
 * akan diam-diam menyalakannya lagi, atau sebaliknya. Nilai baru selalu menang bila
 * keduanya ada — artinya admin memang sudah memilih dengan kontrol yang baru.
 */
function terjemahkanSetelanLama(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const objek = raw as Record<string, unknown>
  const services = objek.services
  if (!services || typeof services !== 'object') return raw

  const svc = services as Record<string, unknown>
  if ('badgeStyle' in svc || !('showIcon' in svc)) return raw

  return {
    ...objek,
    services: { ...svc, badgeStyle: svc.showIcon === false ? 'code' : 'icon' },
  }
}

export function parsePublicPageTheme(rawAsli: unknown): PublicPageTheme {
  const raw = terjemahkanSetelanLama(rawAsli)
  const hasil = publicPageThemeSchema.safeParse(raw ?? {})
  if (hasil.success) return hasil.data

  /**
   * Ada nilai yang rusak. Yang masih sah tetap dipakai, sisanya kembali ke bawaan.
   *
   * Skemanya sendiri sengaja tetap ketat di API — admin yang mengirim warna tidak
   * valid harus diberi tahu. Tetapi saat MENYAJIKAN halaman, satu nilai rusak
   * (biasanya hasil sunting langsung di database) tidak boleh menghapus seluruh
   * tampilan yang sudah disusun.
   */
  const bawaan = publicPageThemeSchema.parse({})
  if (!raw || typeof raw !== 'object') return bawaan

  const sebagian: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = publicPageThemeSchema.shape[key as keyof PublicPageTheme]
    if (field && field.safeParse(value).success) sebagian[key] = value
  }
  return publicPageThemeSchema.parse(sebagian)
}

/** Warna aksen efektif: yang dipilih admin, atau warna utama bila dikosongkan. */
export function accentOf(theme: PublicPageTheme): string {
  return theme.accentColor || theme.primaryColor
}
