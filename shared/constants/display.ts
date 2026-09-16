/**
 * Tipe perangkat layar antrean.
 *
 * Satu daftar dipakai tiga pihak: skema validasi endpoint, pilihan di halaman
 * admin, dan penyaring papan di `display.service`. Menambah tipe baru hanya di
 * salah satunya membuat nilai yang lolos validasi tetapi tidak pernah menyaring
 * apa pun — layar yang seolah-olah tersetel padahal menampilkan semuanya.
 */
export const DISPLAY_TYPES = ['GLOBAL', 'QUEUE_TYPE', 'SUBSET'] as const
export type DisplayDeviceType = (typeof DISPLAY_TYPES)[number]

export const DISPLAY_TYPE_OPTIONS: Array<{ label: string, value: DisplayDeviceType }> = [
  { label: 'Global — semua layanan', value: 'GLOBAL' },
  { label: 'Khusus satu layanan', value: 'QUEUE_TYPE' },
  { label: 'Beberapa layanan — pilih & urutkan', value: 'SUBSET' },
]

/**
 * Batas jumlah layanan pada satu layar bertipe SUBSET.
 *
 * Bukan batas teknis: papan antrean menyusun kartunya maksimal tiga kolom, jadi
 * 24 layanan sudah berarti delapan baris yang tak mungkin terbaca dari seberang
 * ruangan. Angkanya ada supaya larik dari badan permintaan tidak tumbuh sebesar
 * apa pun yang dikirim penelepon.
 */
export const MAX_SUBSET_QUEUE_TYPES = 24

/**
 * Bersihkan daftar id layanan yang tersimpan.
 *
 * Kolomnya JSON tanpa kunci asing — mengikuti pola `public_pages.allowed_queue_type_ids`
 * yang sudah ada — jadi isinya bisa memuat id layanan yang sudah dihapus, duplikat,
 * atau nilai yang bukan id sama sekali (hasil sunting langsung di basis data).
 * URUTAN DIPERTAHANKAN: itulah satu-satunya tempat urutan pilihan admin disimpan.
 */
export function parseQueueTypeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const keluar: string[] = []
  for (const nilai of raw) {
    if (typeof nilai !== 'string') continue
    if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(nilai)) continue
    if (keluar.includes(nilai)) continue
    keluar.push(nilai)
  }
  return keluar.slice(0, MAX_SUBSET_QUEUE_TYPES)
}
