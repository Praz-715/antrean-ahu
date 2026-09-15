/**
 * Warna yang tetap terbaca di atas latar gelap.
 *
 * Warna jenis antrean dipilih sendiri oleh admin, lalu dipakai sebagai WARNA TEKS
 * di beberapa tempat (nomor antrean, lencana kode layanan). Pada tema terang itu
 * baik-baik saja, tetapi warna pekat seperti biru brand di atas kartu gelap hanya
 * mencapai ±2,5:1 — jauh di bawah 4,5:1 yang diminta WCAG AA.
 *
 * Warnanya tidak diganti, hanya diterangkan sampai cukup terbaca, sehingga identitas
 * tiap layanan tetap terjaga.
 */

/** Latar kartu pada tema gelap (slate-800). Jadi acuan perhitungan rasio. */
const DARK_SURFACE_LUMINANCE = 0.0296

function hexToRgb(hex: string): [number, number, number] | null {
  const value = hex.trim().replace('#', '')
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return [0, 2, 4].map(i => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

function toChannel(v: number) {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(rgb: [number, number, number]) {
  const [r, g, b] = rgb.map(toChannel) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: number, b: number) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * Warna teks yang terbaca DI ATAS warna pilihan admin.
 *
 * Berbeda tujuan dari `readableColor`, yang menerangkan warna agar terbaca sebagai
 * teks di atas latar gelap. Yang ini menjawab pertanyaan sebaliknya: hero dan tombol
 * halaman publik memakai warna utama sebagai LATAR, jadi teks di atasnya harus ikut
 * berubah — putih di atas biru tua, gelap di atas kuning muda. Tanpa ini, admin yang
 * memilih warna terang mendapat tombol yang tulisannya nyaris tak terlihat.
 */
export function onColor(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#ffffff'

  const lum = relativeLuminance(rgb)
  const putih = contrastRatio(lum, 1)
  const gelap = contrastRatio(lum, relativeLuminance([15, 23, 42])) // slate-900
  return putih >= gelap ? '#ffffff' : '#0f172a'
}

/** `#1b5cf5` + 0.12 → `rgb(27 92 245 / 0.12)`, aman dipakai di CSS mana pun. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${alpha})`
}

function rgbToHex(rgb: [number, number, number]) {
  return '#' + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
}

/**
 * Terangkan warna sampai kontrasnya terhadap latar gelap mencapai `minRatio`.
 * Bila warnanya sudah cukup terang — atau bukan warna yang bisa dibaca — kembalikan apa adanya.
 */
export function readableColor(hex: string, dark: boolean, minRatio = 4.5): string {
  if (!dark) return hex

  const rgb = hexToRgb(hex)
  if (!rgb) return hex

  if (contrastRatio(relativeLuminance(rgb), DARK_SURFACE_LUMINANCE) >= minRatio) return hex

  // Campur bertahap dengan putih; 12 langkah sudah cukup halus untuk mata.
  for (let step = 1; step <= 12; step++) {
    const mix = step / 12
    const lifted: [number, number, number] = [
      rgb[0] + (255 - rgb[0]) * mix,
      rgb[1] + (255 - rgb[1]) * mix,
      rgb[2] + (255 - rgb[2]) * mix,
    ]
    if (contrastRatio(relativeLuminance(lifted), DARK_SURFACE_LUMINANCE) >= minRatio) {
      return rgbToHex(lifted)
    }
  }

  return '#e2e8f0' // slate-200: jaring pengaman untuk warna yang sangat pekat
}
