import type { PublicPageTheme } from '#shared/schemas/public-page'
import { accentOf } from '#shared/schemas/public-page'
import { onColor } from '#shared/utils/color'

/**
 * Variabel CSS tema halaman publik.
 *
 * Dipakai DUA tempat, dan itulah alasan komposabel ini ada: perender halaman dan
 * dialog pengambilan nomor. Dialognya sebuah `UModal`, yang di-teleport ke `body`
 * dan dipasang sebagai saudara — bukan anak — dari perender halaman. Variabel yang
 * hanya dideklarasikan di akar perender karena itu tidak pernah sampai ke sana, dan
 * `background-color: var(--public-primary)` pada tombol "Ambil Nomor Antrean"
 * diabaikan peramban: tombolnya tampil tanpa warna sama sekali.
 *
 * Sebelumnya perhitungan ini ditulis langsung di dalam perender halaman. Diangkat
 * ke sini supaya kedua tempat memakai definisi yang sama — menyalinnya berarti
 * warna dialog bisa menyimpang dari warna halaman pada perubahan berikutnya.
 */
export function usePublicThemeVars(theme: MaybeRefOrGetter<PublicPageTheme>) {
  // Warna utama sering pekat; sebagai teks di tema gelap ia perlu diterangkan dulu.
  const { readable } = useReadableColor()

  return computed<Record<string, string>>(() => {
    const t = toValue(theme)
    return {
      '--public-primary': t.primaryColor,
      '--public-secondary': t.secondaryColor,
      '--public-accent': accentOf(t),
      /** Warna teks yang kontras di atas warna utama (hero, tombol). */
      '--public-on-primary': onColor(t.primaryColor),
      /** Warna utama versi aman-dibaca, untuk teks dan ikon di atas latar halaman. */
      '--public-link': readable(t.primaryColor) ?? t.primaryColor,
      ...(t.fontFamily ? { fontFamily: t.fontFamily } : {}),
    }
  })
}
