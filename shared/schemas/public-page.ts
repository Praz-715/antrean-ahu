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
  showIcon: z.boolean().default(true),
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
  primaryColor: hexColorSchema.default('#1b5cf5'),
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
export function parsePublicPageTheme(raw: unknown): PublicPageTheme {
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
