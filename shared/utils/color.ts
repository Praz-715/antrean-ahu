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

/** `#132b48` + 0.12 → `rgb(19 43 72 / 0.12)`, aman dipakai di CSS mana pun. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${alpha})`
}

function rgbToHex(rgb: [number, number, number]) {
  return '#' + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === rn
    ? ((gn - bn) / d + (gn < bn ? 6 : 0))
    : max === gn
      ? (bn - rn) / d + 2
      : (rn - gn) / d + 4
  return [h / 6, s, l]
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    let v = t
    if (v < 0) v += 1
    if (v > 1) v -= 1
    if (v < 1 / 6) return p + (q - p) * 6 * v
    if (v < 1 / 2) return q
    if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6
    return p
  }
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255]
}

/**
 * Terangkan warna sampai kontrasnya terhadap latar gelap mencapai `minRatio`.
 * Bila warnanya sudah cukup terang — atau bukan warna yang bisa dibaca — kembalikan apa adanya.
 *
 * Yang dinaikkan hanya LIGHTNESS di ruang HSL; hue dan saturasinya dibiarkan.
 * Sebelumnya warnanya dicampur putih, dan itu menurunkan saturasi bersamaan dengan
 * menaikkan terang: warna pekat seperti navy #132b48 keluar sebagai kelabu kebiruan
 * yang tak lagi mengingatkan pada warna aslinya — paling terasa pada nomor antrean
 * setinggi 14rem di papan antrean, yang justru elemen paling menonjol di ruang tunggu.
 * Menaikkan lightness saja membuat navy itu menjadi biru muda yang masih jelas navy.
 *
 * Saturasi warna yang sangat pekat dinaikkan sedikit (maksimal 0,55) supaya tidak
 * ikut pudar saat lightness-nya mendekati puncak.
 */
export function readableColor(hex: string, dark: boolean, minRatio = 4.5): string {
  if (!dark) return hex

  const rgb = hexToRgb(hex)
  if (!rgb) return hex

  if (contrastRatio(relativeLuminance(rgb), DARK_SURFACE_LUMINANCE) >= minRatio) return hex

  const [h, s, l] = rgbToHsl(rgb)
  const saturasi = Math.max(s, Math.min(0.55, s * 1.25))

  // 24 langkah lightness: cukup halus supaya tidak melompati ambang kontras.
  for (let step = 1; step <= 24; step++) {
    const lifted = hslToRgb([h, saturasi, Math.min(1, l + (1 - l) * (step / 24))])
    if (contrastRatio(relativeLuminance(lifted), DARK_SURFACE_LUMINANCE) >= minRatio) {
      return rgbToHex(lifted)
    }
  }

  return '#e2e8f0' // slate-200: jaring pengaman untuk warna yang sangat pekat
}
